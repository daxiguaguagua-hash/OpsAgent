import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  AgentMessage,
  AgentMessageType,
  ExecutionResult,
} from "./taskTypes.ts";

export interface SendMessageInput {
  taskId: string;
  from: string;
  to: string;
  type: AgentMessageType;
  subject: string;
  content: string;
  replyTo?: string;
  metadata?: AgentMessage["metadata"];
}

export class MessageBus {
  private readonly root: string;

  constructor(root = ".agent/messages") {
    this.root = root;
  }

  send(input: SendMessageInput, now = new Date().toISOString()): AgentMessage {
    const message: AgentMessage = {
      id: randomUUID(),
      ...input,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.writeInbox(message);
    this.writeOutbox(message);
    return message;
  }

  listInbox(recipient: string, includeRead = true): AgentMessage[] {
    return this.readDirectory(this.inboxDirectory(recipient))
      .filter((message) => includeRead || message.status === "pending")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  listOutbox(sender: string): AgentMessage[] {
    return this.readDirectory(this.outboxDirectory(sender))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  get(recipient: string, id: string): AgentMessage {
    const inboxPath = this.inboxPath(recipient, id);
    const archivePath = this.archivePath(recipient, id);
    const path = existsSync(inboxPath) ? inboxPath : archivePath;
    if (!existsSync(path)) {
      throw new Error(`Message '${id}' was not found for '${recipient}'`);
    }
    return this.readMessage(path);
  }

  markRead(recipient: string, id: string, now = new Date().toISOString()): AgentMessage {
    const message = this.get(recipient, id);
    if (message.status === "resolved") {
      throw new Error(`Message '${id}' is already resolved`);
    }
    const updated = { ...message, status: "read" as const, updatedAt: now };
    this.writeInbox(updated);
    this.writeOutbox(updated);
    return updated;
  }

  resolve(recipient: string, id: string, now = new Date().toISOString()): AgentMessage {
    const message = this.get(recipient, id);
    const updated = { ...message, status: "resolved" as const, updatedAt: now };
    const inboxPath = this.inboxPath(recipient, id);
    const archivePath = this.archivePath(recipient, id);
    this.ensureDirectory(this.archiveDirectory(recipient));
    writeFileSync(archivePath, serialize(updated));
    if (existsSync(inboxPath)) {
      unlinkSync(inboxPath);
    }
    this.writeOutbox(updated);
    return updated;
  }

  reply(
    recipient: string,
    id: string,
    from: string,
    type: AgentMessageType,
    content: string,
    now = new Date().toISOString(),
  ): AgentMessage {
    const original = this.get(recipient, id);
    if (original.to !== from) {
      throw new Error(`Only recipient '${original.to}' can reply to message '${id}'`);
    }
    return this.send({
      taskId: original.taskId,
      from,
      to: original.from,
      type,
      subject: `Re: ${original.subject}`,
      content,
      replyTo: original.id,
    }, now);
  }

  createExecutionResultMessage(
    result: ExecutionResult,
    to = "codex",
  ): AgentMessage {
    return this.send({
      taskId: result.taskId,
      from: result.actor,
      to,
      type: "execution_result",
      subject: `${result.role} execution completed`,
      content: result.output,
      metadata: {
        success: result.success,
        ...(result.sessionId ? { sessionId: result.sessionId } : {}),
        ...(result.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
        ...(result.costUsd !== undefined ? { costUsd: result.costUsd } : {}),
      },
    }, result.completedAt);
  }

  formatInboxForPrompt(recipient: string, taskId: string): string {
    const messages = this.listInbox(recipient, false)
      .filter((message) => message.taskId === taskId);
    if (messages.length === 0) {
      return "";
    }
    return [
      "Pending messages for this actor:",
      ...messages.flatMap((message) => [
        `- [${message.type}] ${message.subject} (messageId: ${message.id}, from: ${message.from})`,
        `  ${message.content}`,
      ]),
      "Use the message CLI to send clarification or test-change requests when needed.",
    ].join("\n");
  }

  markPendingRead(
    recipient: string,
    taskId: string,
    now = new Date().toISOString(),
  ): AgentMessage[] {
    return this.listInbox(recipient, false)
      .filter((message) => message.taskId === taskId)
      .map((message) => this.markRead(recipient, message.id, now));
  }

  private writeInbox(message: AgentMessage): void {
    this.ensureDirectory(this.inboxDirectory(message.to));
    writeFileSync(this.inboxPath(message.to, message.id), serialize(message));
  }

  private writeOutbox(message: AgentMessage): void {
    this.ensureDirectory(this.outboxDirectory(message.from));
    writeFileSync(this.outboxPath(message.from, message.id), serialize(message));
  }

  private readDirectory(directory: string): AgentMessage[] {
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory)
      .filter((name) => name.endsWith(".json"))
      .map((name) => this.readMessage(join(directory, name)));
  }

  private readMessage(path: string): AgentMessage {
    return JSON.parse(readFileSync(path, "utf8")) as AgentMessage;
  }

  private ensureDirectory(path: string): void {
    mkdirSync(path, { recursive: true });
  }

  private inboxDirectory(recipient: string): string {
    return join(this.root, "inbox", safeName(recipient));
  }

  private outboxDirectory(sender: string): string {
    return join(this.root, "outbox", safeName(sender));
  }

  private archiveDirectory(recipient: string): string {
    return join(this.root, "archive", safeName(recipient));
  }

  private inboxPath(recipient: string, id: string): string {
    return join(this.inboxDirectory(recipient), `${safeName(id)}.json`);
  }

  private outboxPath(sender: string, id: string): string {
    return join(this.outboxDirectory(sender), `${safeName(id)}.json`);
  }

  private archivePath(recipient: string, id: string): string {
    return join(this.archiveDirectory(recipient), `${safeName(id)}.json`);
  }
}

function safeName(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!safe) {
    throw new Error("Message path component cannot be empty");
  }
  return safe;
}

function serialize(message: AgentMessage): string {
  return `${JSON.stringify(message, null, 2)}\n`;
}
