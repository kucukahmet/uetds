from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return response
    if isinstance(response.data, dict) and response.data.get("success") is False:
        return response
    response.data = {
        "success": False,
        "error_code": getattr(exc, "default_code", "error"),
        "message": response.data,
    }
    return response
