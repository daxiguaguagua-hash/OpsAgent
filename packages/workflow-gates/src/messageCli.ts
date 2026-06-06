import { MessageBus } from "./messageBus.ts";
import type { AgentMessageType } from "./taskTypes.ts";

const bus = new MessageBus();
const rawArgs = process.argv.slice(2);
const separatorIndex = rawArgs.indexOf("--");
if (separatorIndex >= 0) {
  rawArgs.splice(separatorIndex, 1);
}
const [command, ...args] = rawArgs;

try {
  switch (command) {
    case "send":
      print(bus.send({
        taskId: required(args[0], "taskId"),
        from: required(args[1], "from"),
        to: required(args[2], "to"),
        type: messageType(args[3]),
        subject: required(args[4], "subject"),
        content: required(args.slice(5).join(" "), "content"),
      }));
      break;
    case "inbox":
      print(bus.listInbox(required(args[0], "recipient"), !args.includes("--unread")));
      break;
    case "outbox":
      print(bus.listOutbox(required(args[0], "sender")));
      break;
    case "show":
      print(bus.get(required(args[0], "recipient"), required(args[1], "messageId")));
      break;
    case "read":
      print(bus.markRead(required(args[0], "recipient"), required(args[1], "messageId")));
      break;
    case "resolve":
      print(bus.resolve(required(args[0], "recipient"), required(args[1], "messageId")));
      break;
    case "reply":
      print(bus.reply(
        required(args[0], "recipient"),
        required(args[1], "messageId"),
        required(args[2], "from"),
        messageType(args[3]),
        required(args.slice(4).join(" "), "content"),
      ));
      break;
    default:
      printUsage();
      process.exitCode = command ? 2 : 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

function messageType(value: string | undefined): AgentMessageType {
  const type = required(value, "type") as AgentMessageType;
  const valid: AgentMessageType[] = [
    "task_assignment",
    "execution_result",
    "test_change_request",
    "review_request",
    "decision",
    "clarification",
  ];
  if (!valid.includes(type)) {
    throw new Error(`Invalid message type: ${type}`);
  }
  return type;
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function printUsage(): void {
  console.log(`OpsAgent message CLI

Commands:
  send <taskId> <from> <to> <type> <subject> <content...>
  inbox <recipient> [--unread]
  outbox <sender>
  show <recipient> <messageId>
  read <recipient> <messageId>
  resolve <recipient> <messageId>
  reply <recipient> <messageId> <from> <type> <content...>`);
}
