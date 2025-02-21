import * as React from 'react';
import isEqual from 'lodash/isEqual';
import omitBy from 'lodash/omitBy';

import {doEventsRequest} from 'app/actionCreators/events';
import {addErrorMessage} from 'app/actionCreators/indicator';
import {Client} from 'app/api';
import LoadingPanel from 'app/components/charts/loadingPanel';
import {canIncludePreviousPeriod, isMultiSeriesStats} from 'app/components/charts/utils';
import {t} from 'app/locale';
import {
  DateString,
  EventsStats,
  EventsStatsData,
  MultiSeriesEventsStats,
  OrganizationSummary,
} from 'app/types';
import {Series, SeriesDataUnit} from 'app/types/echarts';

export type TimeSeriesData = {
  // timeseries data
  timeseriesData?: Series[];
  allTimeseriesData?: EventsStatsData;
  originalTimeseriesData?: EventsStatsData;
  timeseriesTotals?: {count: number};
  originalPreviousTimeseriesData?: EventsStatsData | null;
  previousTimeseriesData?: Series | null;
  timeAggregatedData?: Series | {};
  timeframe?: {start: number; end: number};
};

type LoadingStatus = {
  loading: boolean;
  reloading: boolean;
  /**
   * Whether there was an error retrieving data
   */
  errored: boolean;
};

// Chart format for multiple series.
type MultiSeriesResults = Series[];

type RenderProps = LoadingStatus & TimeSeriesData & {results?: MultiSeriesResults};

type DefaultProps = {
  /**
   * Relative time period for query.
   *
   * Use `start` and `end` for absolute dates.
   *
   * e.g. 24h, 7d, 30d
   */
  period?: string;
  /**
   * Absolute start date for query
   */
  start?: DateString;
  /**
   * Absolute end date for query
   */
  end?: DateString;
  /**
   * Interval to group results in
   *
   * e.g. 1d, 1h, 1m, 1s
   */
  interval: string;
  /**
   * number of rows to return
   */
  limit: number;
  /**
   * The query string to search events by
   */
  query: string;
  /**
   * Include data for previous period
   */
  includePrevious: boolean;
  /**
   * Transform the response data to be something ingestible by charts
   */
  includeTransformedData: boolean;
};

type EventsRequestPartialProps = {
  /**
   * API client instance
   */
  api: Client;
  organization: OrganizationSummary;
  /**
   * List of project ids to query
   */
  project?: Readonly<number[]>;
  /**
   * List of environments to query
   */
  environment?: Readonly<string[]>;
  /**
   * List of team ids to query
   */
  team?: Readonly<string | string[]>;
  /**
   * List of fields to group with when doing a topEvents request.
   */
  field?: string[];
  /**
   * Initial loading state
   */
  loading?: boolean;
  /**
   * Should loading be shown.
   */
  showLoading?: boolean;
  /**
   * The yAxis being plotted. If multiple yAxis are requested,
   * the child render function will be called with `results`
   */
  yAxis?: string | string[];
  /**
   * Name used for display current series data set tooltip
   */
  currentSeriesName?: string;
  previousSeriesName?: string;
  children: (renderProps: RenderProps) => React.ReactNode;
  /**
   * The number of top results to get. When set a multi-series result will be returned
   * in the `results` child render function.
   */
  topEvents?: number;
  /**
   * How to order results when getting top events.
   */
  orderby?: string;
  /**
   * Discover needs confirmation to run >30 day >10 project queries,
   * optional and when not passed confirmation is not required.
   */
  confirmedQuery?: boolean;
  /**
   * Is query out of retention
   */
  expired?: boolean;
  /**
   * Query name used for displaying error toast if it is out of retention
   */
  name?: string;
  /**
   * Whether or not to include the last partial bucket. This happens for example when the
   * current time is 11:26 and the last bucket ranges from 11:25-11:30. This means that
   * the last bucket contains 1 minute worth of data while the rest contains 5 minutes.
   *
   * This flag indicates whether or not this last bucket should be included in the result.
   */
  partial: boolean;
  /**
   * Hide error toast (used for pages which also query eventsV2)
   */
  hideError?: boolean;
  /**
   * Whether or not to zerofill results
   */
  withoutZerofill?: boolean;
};

type TimeAggregationProps =
  | {includeTimeAggregation: true; timeAggregationSeriesName: string}
  | {includeTimeAggregation?: false; timeAggregationSeriesName?: undefined};

type EventsRequestProps = DefaultProps & TimeAggregationProps & EventsRequestPartialProps;

type EventsRequestState = {
  reloading: boolean;
  errored: boolean;
  timeseriesData: null | EventsStats | MultiSeriesEventsStats;
  fetchedWithPrevious: boolean;
};

const propNamesToIgnore = ['api', 'children', 'organization', 'loading'];
const omitIgnoredProps = (props: EventsRequestProps) =>
  omitBy(props, (_value, key) => propNamesToIgnore.includes(key));

class EventsRequest extends React.PureComponent<EventsRequestProps, EventsRequestState> {
  static defaultProps: DefaultProps = {
    period: undefined,
    start: null,
    end: null,
    interval: '1d',
    limit: 15,
    query: '',
    includePrevious: true,
    includeTransformedData: true,
  };

  state: EventsRequestState = {
    reloading: !!this.props.loading,
    errored: false,
    timeseriesData: null,
    fetchedWithPrevious: false,
  };

  componentDidMount() {
    this.fetchData();
  }

  componentDidUpdate(prevProps: EventsRequestProps) {
    if (isEqual(omitIgnoredProps(prevProps), omitIgnoredProps(this.props))) {
      return;
    }
    this.fetchData();
  }

  componentWillUnmount() {
    this.unmounting = true;
  }

  private unmounting: boolean = false;

  fetchData = async () => {
    const {api, confirmedQuery, expired, name, hideError, ...props} = this.props;
    let timeseriesData: EventsStats | MultiSeriesEventsStats | null = null;

    if (confirmedQuery === false) {
      return;
    }

    this.setState(state => ({
      reloading: state.timeseriesData !== null,
      errored: false,
    }));

    if (expired) {
      addErrorMessage(
        t('%s has an invalid date range. Please try a more recent date range.', name),
        {append: true}
      );

      this.setState({
        errored: true,
      });
    } else {
      try {
        api.clear();
        timeseriesData = await doEventsRequest(api, props);
      } catch (resp) {
        if (!hideError) {
          if (resp && resp.responseJSON && resp.responseJSON.detail) {
            addErrorMessage(resp.responseJSON.detail);
          } else {
            addErrorMessage(t('Error loading chart data'));
          }
        }
        this.setState({
          errored: true,
        });
      }
    }

    if (this.unmounting) {
      return;
    }

    this.setState({
      reloading: false,
      timeseriesData,
      fetchedWithPrevious: props.includePrevious,
    });
  };

  /**
   * Retrieves data set for the current period (since data can potentially
   * contain previous period's data), as well as the previous period if
   * possible.
   *
   * Returns `null` if data does not exist
   */
  getData = (
    data: EventsStatsData
  ): {previous: EventsStatsData | null; current: EventsStatsData} => {
    const {fetchedWithPrevious} = this.state;
    const {period, includePrevious} = this.props;

    const hasPreviousPeriod =
      fetchedWithPrevious || canIncludePreviousPeriod(includePrevious, period);
    // Take the floor just in case, but data should always be divisible by 2
    const dataMiddleIndex = Math.floor(data.length / 2);
    return {
      current: hasPreviousPeriod ? data.slice(dataMiddleIndex) : data,
      previous: hasPreviousPeriod ? data.slice(0, dataMiddleIndex) : null,
    };
  };

  // This aggregates all values per `timestamp`
  calculateTotalsPerTimestamp(
    data: EventsStatsData,
    getName: (
      timestamp: number,
      countArray: {count: number}[],
      i: number
    ) => number = timestamp => timestamp * 1000
  ): SeriesDataUnit[] {
    return data.map(([timestamp, countArray], i) => ({
      name: getName(timestamp, countArray, i),
      value: countArray.reduce((acc, {count}) => acc + count, 0),
    }));
  }

  /**
   * Get previous period data, but transform timestamps so that data fits unto
   * the current period's data axis
   */
  transformPreviousPeriodData(
    current: EventsStatsData,
    previous: EventsStatsData | null
  ): Series | null {
    // Need the current period data array so we can take the timestamp
    // so we can be sure the data lines up
    if (!previous) {
      return null;
    }

    return {
      seriesName: this.props.previousSeriesName ?? 'Previous',
      data: this.calculateTotalsPerTimestamp(
        previous,
        (_timestamp, _countArray, i) => current[i][0] * 1000
      ),
    };
  }

  /**
   * Aggregate all counts for each time stamp
   */
  transformAggregatedTimeseries(data: EventsStatsData, seriesName: string = ''): Series {
    return {
      seriesName,
      data: this.calculateTotalsPerTimestamp(data),
    };
  }

  /**
   * Transforms query response into timeseries data to be used in a chart
   */
  transformTimeseriesData(data: EventsStatsData, seriesName?: string): Series[] {
    return [
      {
        seriesName: seriesName || 'Current',
        data: data.map(([timestamp, countsForTimestamp]) => ({
          name: timestamp * 1000,
          value: countsForTimestamp.reduce((acc, {count}) => acc + count, 0),
        })),
      },
    ];
  }

  processData(response: EventsStats | null) {
    if (!response) {
      return {};
    }

    const {data, totals} = response;
    const {includeTransformedData, includeTimeAggregation, timeAggregationSeriesName} =
      this.props;
    const {current, previous} = this.getData(data);
    const transformedData = includeTransformedData
      ? this.transformTimeseriesData(current, this.props.currentSeriesName)
      : [];
    const previousData = includeTransformedData
      ? this.transformPreviousPeriodData(current, previous)
      : null;
    const timeAggregatedData = includeTimeAggregation
      ? this.transformAggregatedTimeseries(current, timeAggregationSeriesName || '')
      : {};
    const timeframe =
      response.start && response.end
        ? {
            start: response.start * 1000,
            end: response.end * 1000,
          }
        : undefined;
    return {
      data: transformedData,
      allData: data,
      originalData: current,
      totals,
      originalPreviousData: previous,
      previousData,
      timeAggregatedData,
      timeframe,
    };
  }

  render() {
    const {children, showLoading, ...props} = this.props;
    const {timeseriesData, reloading, errored} = this.state;
    // Is "loading" if data is null
    const loading = this.props.loading || timeseriesData === null;

    if (showLoading && loading) {
      return <LoadingPanel data-test-id="events-request-loading" />;
    }

    if (isMultiSeriesStats(timeseriesData)) {
      // Convert multi-series results into chartable series. Multi series results
      // are created when multiple yAxis are used or a topEvents request is made.
      // Convert the timeseries data into a multi-series result set.
      // As the server will have replied with a map like:
      // {[titleString: string]: EventsStats}
      let timeframe: {start: number; end: number} | undefined = undefined;
      const results: MultiSeriesResults = Object.keys(timeseriesData)
        .map((seriesName: string): [number, Series] => {
          const seriesData: EventsStats = timeseriesData[seriesName];
          // Use the first timeframe we find from the series since all series have the same timeframe anyways
          if (seriesData.start && seriesData.end && !timeframe) {
            timeframe = {
              start: seriesData.start * 1000,
              end: seriesData.end * 1000,
            };
          }
          const transformed = this.transformTimeseriesData(
            seriesData.data,
            seriesName
          )[0];
          return [seriesData.order || 0, transformed];
        })
        .sort((a, b) => a[0] - b[0])
        .map(item => item[1]);

      return children({
        loading,
        reloading,
        errored,
        results,
        timeframe,
        // sometimes we want to reference props that were given to EventsRequest
        ...props,
      });
    }

    const {
      data: transformedTimeseriesData,
      allData: allTimeseriesData,
      originalData: originalTimeseriesData,
      totals: timeseriesTotals,
      originalPreviousData: originalPreviousTimeseriesData,
      previousData: previousTimeseriesData,
      timeAggregatedData,
      timeframe,
    } = this.processData(timeseriesData);

    return children({
      loading,
      reloading,
      errored,
      // timeseries data
      timeseriesData: transformedTimeseriesData,
      allTimeseriesData,
      originalTimeseriesData,
      timeseriesTotals,
      originalPreviousTimeseriesData,
      previousTimeseriesData,
      timeAggregatedData,
      timeframe,
      // sometimes we want to reference props that were given to EventsRequest
      ...props,
    });
  }
}
export default EventsRequest;
