from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_title: str = "Resume Requirement Matching API"
    app_version: str = "1.0.0"

    requirement_excel_path: str = "input/excel_dummy_Req_Output.xlsx"

    openai_api_key: str
    openai_model: str = "gpt-5.5"

    anthropic_api_key: str
    claude_model: str = "claude-sonnet-4-5"

    auth_username: str = "siro"
    auth_password: str = "siroai"

    max_pdf_size_mb: int = 20
    max_tokens: int = 4000

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()