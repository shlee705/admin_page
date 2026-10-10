"""Strict fixture DTO validation, separate from ownership and persistence."""
from datetime import datetime, date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from fastapi import HTTPException


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: str = Field(min_length=1, max_length=80)


class Event(Record):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(max_length=4000)
    start: str
    end: str
    allDay: bool
    category: Literal["personal", "work", "team", "travel", "finance", "birthday", "holiday"]

    @model_validator(mode="after")
    def dates(self):
        if not self.title.strip():
            raise ValueError("Title cannot be blank")
        expected_length = 10 if self.allDay else 16
        if len(self.start) != expected_length or len(self.end) != expected_length:
            raise ValueError("Invalid calendar date format")
        if datetime.fromisoformat(self.end) <= datetime.fromisoformat(self.start):
            raise ValueError("Event end must follow start")
        return self


class Message(Record):
    roomId: str = Field(min_length=1, max_length=80)
    senderId: str = Field(min_length=1, max_length=80)
    senderName: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=4000)
    sentAt: str
    delivery: Literal["fixture", "mock-saved"]


class Room(Record):
    name: str = Field(min_length=1, max_length=80)
    participantIds: list[str] = Field(max_length=10)
    lastReadAt: str | None
    messages: list[Message] = Field(max_length=500)


class TaskSource(Record):
    kind: Literal["mail", "calendar", "chat"]
    roomId: str | None = Field(default=None, max_length=80)


class Task(Record):
    title: str = Field(min_length=1, max_length=200)
    done: bool
    description: str = Field(default="", max_length=4000)
    dueDate: str | None = None
    priority: Literal["normal", "high", "low"] = "normal"
    completedAt: str | None = None
    source: TaskSource | None = None

    @model_validator(mode="after")
    def task_dates(self):
        if self.dueDate and date.fromisoformat(self.dueDate).isoformat() != self.dueDate:
            raise ValueError("Invalid due date")
        if self.completedAt:
            value = datetime.fromisoformat(self.completedAt.replace("Z", "+00:00"))
            if not self.done or not value.tzinfo:
                raise ValueError("Completion time requires a completed task and timezone")
        return self


def validate_workspace(kind, state, user):
    key = {"calendar": "events", "chat": "rooms", "tasks": "tasks"}[kind]
    if set(state) != {"version", "ownerId", key} or state.get("version") != 1 or state.get("ownerId") != user.id or not isinstance(state.get(key), list) or len(state[key]) > 500:
        raise HTTPException(422, "Invalid account workspace snapshot")
    try:
        model = {"calendar": Event, "chat": Room, "tasks": Task}[kind]
        records = [model.model_validate(record) for record in state[key]]
        if len({record.id for record in records}) != len(records):
            raise ValueError("Duplicate record IDs")
        for record in records:
            if kind == "tasks" and not record.title.strip():
                raise ValueError("Task title cannot be blank")
            if kind != "chat":
                continue
            if not record.name.strip() or user.id not in record.participantIds:
                raise ValueError("Invalid private mock room")
            if any(participant != user.id and not participant.startswith("fixture-") for participant in record.participantIds):
                raise ValueError("Mock rooms cannot address real recipients")
            if record.lastReadAt:
                datetime.fromisoformat(record.lastReadAt.replace("Z", "+00:00"))
            if len({message.id for message in record.messages}) != len(record.messages):
                raise ValueError("Duplicate message IDs")
            for message in record.messages:
                datetime.fromisoformat(message.sentAt.replace("Z", "+00:00"))
                if not message.body.strip() or message.roomId != record.id:
                    raise ValueError("Invalid message")
                if message.senderId == user.id:
                    if message.delivery != "mock-saved" or not message.senderName.strip():
                        raise ValueError("Invalid own mock message")
                elif not message.senderId.startswith("fixture-") or message.delivery != "fixture" or message.senderId not in record.participantIds:
                    raise ValueError("Invalid fixture sender")
    except (ValidationError, ValueError, TypeError):
        raise HTTPException(422, "Invalid workspace records or date range")
