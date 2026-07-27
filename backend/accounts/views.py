from django.contrib.auth import authenticate
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from accounts.serializers import LoginSerializer, LogoutSerializer, UserSerializer
from companies.models import CompanyMembership


def serialize_auth_response(user):
    refresh = RefreshToken.for_user(user)
    if user.active_company_id:
        refresh["active_company_id"] = str(user.active_company_id)
    return {
        "access_token": str(refresh.access_token),
        "refresh_token": str(refresh),
        "token_type": "Bearer",
        "expires_in": 12 * 60 * 60,
        "session_expires_in": 7 * 24 * 60 * 60,
        "user": UserSerializer(user).data,
    }


class LoginView(generics.GenericAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = LoginSerializer

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request,
            username=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
        )
        if not user:
            return Response(
                {"success": False, "error_code": "UNAUTHORIZED", "message": "E-posta veya şifre hatalı."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        company_id = serializer.validated_data.get("company_id")
        memberships = CompanyMembership.objects.filter(user=user, is_active=True)
        if company_id and memberships.filter(company_id=company_id).exists():
            user.active_company_id = company_id
            user.save(update_fields=["active_company_id"])
        elif not user.active_company_id and memberships.exists():
            user.active_company_id = memberships.first().company_id
            user.save(update_fields=["active_company_id"])

        return Response(serialize_auth_response(user))


class RefreshView(TokenRefreshView):
    permission_classes = [permissions.AllowAny]


class LogoutView(generics.GenericAPIView):
    serializer_class = LogoutSerializer

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = RefreshToken(serializer.validated_data["refresh"])
        token.blacklist()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(generics.GenericAPIView):
    serializer_class = UserSerializer

    def get(self, request):
        return Response(UserSerializer(request.user).data)
