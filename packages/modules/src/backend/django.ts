import type { PluginDefinition } from "@systemlabs/foundation-plugin-sdk";

const SETTINGS_PY = `"""
Django settings for <%= projectName %>.
"""

from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "change-me-in-production")

DEBUG = os.getenv("DEBUG", "True") == "True"

ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "api",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

CORS_ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS", "http://localhost:3000"
).split(",")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

STATIC_URL = "/static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
`;

const URLS_PY = `from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
]
`;

const API_VIEWS_PY = `from rest_framework.decorators import api_view
from rest_framework.response import Response
from datetime import datetime


@api_view(["GET"])
def health(request):
    return Response({"status": "ok", "timestamp": datetime.utcnow().isoformat()})
`;

const API_URLS_PY = `from django.urls import path
from . import views

urlpatterns = [
    path("health/", views.health, name="health"),
]
`;

const API_APPS_PY = `from django.apps import AppConfig


class ApiConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "api"
`;

const REQUIREMENTS_TXT = `Django>=5.0.6
djangorestframework>=3.15.1
django-cors-headers>=4.3.1
python-dotenv>=1.0.1
gunicorn>=22.0.0
`;

const ENV_EXAMPLE = `# Django
DJANGO_SECRET_KEY=change-me-to-a-long-random-secret
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ORIGINS=http://localhost:3000
`;

const MANAGE_PY = `#!/usr/bin/env python
"""Django command-line utility."""
import os
import sys


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError("Couldn't import Django.") from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
`;

export const djangoModule: PluginDefinition = {
  manifest: {
    id: "backend-django",
    name: "Django (Python)",
    version: "1.0.0",
    description: "Django REST Framework backend with CORS, settings, and health endpoint",
    category: "backend",
    dependencies: [],
    files: [
      { relativePath: "manage.py", content: MANAGE_PY },
      { relativePath: "config/settings.py", content: SETTINGS_PY },
      { relativePath: "config/urls.py", content: URLS_PY },
      { relativePath: "api/views.py", content: API_VIEWS_PY },
      { relativePath: "api/urls.py", content: API_URLS_PY },
      { relativePath: "api/apps.py", content: API_APPS_PY },
      { relativePath: "requirements.txt", content: REQUIREMENTS_TXT },
      { relativePath: ".env.example", content: ENV_EXAMPLE },
    ],
    configPatches: [
      {
        targetFile: "package.json",
        merge: {
          scripts: {
            dev: "python manage.py runserver 3001",
            start: "gunicorn config.wsgi:application --bind 0.0.0.0:3001",
            migrate: "python manage.py migrate",
            install: "pip install -r requirements.txt",
          },
        },
      },
    ],
    compatibility: {
      conflicts: ["backend-express", "backend-nestjs", "backend-fastapi"],
    },
  },
};
