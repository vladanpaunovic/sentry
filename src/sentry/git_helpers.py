from uuid import uuid4


def parse_branch_format(branch_format, group):
    uuid = uuid4().hex[:8]
    keywords = {
        "[issueId]": f"{group.qualified_short_id}-{uuid}",
        "[orgSlug]": group.project.organization.slug,
        "[projectSlug]": group.project.slug,
    }

    branch_name = branch_format
    for key, value in keywords.items():
        branch_name = branch_name.replace(key, value)
    return branch_name
