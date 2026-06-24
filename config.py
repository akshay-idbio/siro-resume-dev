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
        
    lowcost_claude_model: str = "claude-haiku-4-5-20251001"

    lowcost_requirement_excel_path: str = "input/uploaded_requirement.xlsx"

    lowcost_top_requirements: int = 7
    lowcost_max_matches_per_resume: int = 3

    lowcost_max_resume_chars: int = 6000
    lowcost_max_jd_chars: int = 700
    lowcost_max_output_tokens: int = 1400

    lowcost_max_parallel: int = 8

    lowcost_input_rate_per_million_usd: float = 1.0
    lowcost_output_rate_per_million_usd: float = 5.0
    lowcost_usd_to_inr: float = 95.4


@lru_cache
def get_settings() -> Settings:
    return Settings()