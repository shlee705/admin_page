import re
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class RegisterInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=3, max_length=32)
    displayName: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=12, max_length=128)
    confirmPassword: str = Field(min_length=12, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[a-z][a-z0-9_]{2,31}", value):
            raise ValueError("Username must start with a letter and use 3–32 ASCII letters, numbers or underscores")
        return value

    @field_validator("displayName")
    @classmethod
    def validate_name(cls, value):
        value = value.strip()
        if not value or any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError("Display Name must contain 1–80 visible characters")
        return value

    @model_validator(mode="after")
    def passwords_match(self):
        if self.password != self.confirmPassword:
            raise ValueError("Passwords do not match")
        return self


class LoginInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    identifier: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class MailboxInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expectedRevision: int = Field(ge=0)
    state: dict
