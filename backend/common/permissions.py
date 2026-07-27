ROLE_PERMISSIONS = {
    "super_admin": {"*", "live_uetds_submit"},
    "company_admin": {"*", "live_uetds_submit"},
    "operation_manager": {
        "trip:create",
        "trip:update",
        "trip:submit_uetds",
        "trip:cancel_uetds",
        "vehicle:manage",
        "personnel:manage",
        "passenger:manage",
        "settings:uetds_manage",
        "logs:view",
    },
    "dispatcher": {
        "trip:create",
        "trip:update",
        "trip:submit_uetds",
        "vehicle:view",
        "personnel:view",
        "passenger:manage",
    },
    "driver": {"trip:view_own"},
    "viewer": {"logs:view", "trip:view", "vehicle:view", "personnel:view", "passenger:view"},
}

EXPLICIT_ONLY_PERMISSIONS = {"live_uetds_submit"}


def role_has_permission(role, permission):
    permissions = ROLE_PERMISSIONS.get(role, set())
    if permission in EXPLICIT_ONLY_PERMISSIONS:
        return permission in permissions
    return "*" in permissions or permission in permissions


def user_company_membership(user, company):
    if not user or not user.is_authenticated or not company:
        return None
    if user.is_superuser:
        return True
    return user.company_memberships.filter(company=company, is_active=True).first()
