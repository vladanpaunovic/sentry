import logging

from rest_framework.response import Response

from sentry.api.bases.group import GroupEndpoint
from sentry.constants import BRANCH_FORMAT_DEFAULT
from sentry.git_helpers import parse_branch_format

logger = logging.getLogger("sentry.api")


class GroupBranchNameEndpoint(GroupEndpoint):
    def get(self, request, group):
        organization = group.project.organization
        branch_format = organization.get_option("sentry:branch_format", BRANCH_FORMAT_DEFAULT)
        branch_name = parse_branch_format(branch_format, group)
        return Response({"branchName": branch_name})
