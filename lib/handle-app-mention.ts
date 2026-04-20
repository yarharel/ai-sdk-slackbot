import { AppMentionEvent } from "@slack/web-api";
import { getClient, getThread, getSlackUserEmail } from "./slack-utils";
import { generateResponse } from "./generate-response";

const updateStatusUtil = async (
  initialStatus: string,
  event: AppMentionEvent,
) => {
  const initialMessage = await getClient().chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts ?? event.ts,
    text: initialStatus,
  });

  if (!initialMessage || !initialMessage.ts)
    throw new Error("Failed to post initial message");

  const updateMessage = async (status: string) => {
    await getClient().chat.update({
      channel: event.channel,
      ts: initialMessage.ts as string,
      text: status,
    });
  };
  return updateMessage;
};

export async function handleNewAppMention(
  event: AppMentionEvent,
  botUserId: string,
) {
  if (event.bot_id || event.bot_id === botUserId || event.bot_profile) return;

  const { thread_ts, channel } = event;
  const [updateMessage, userEmail] = await Promise.all([
    updateStatusUtil("is thinking...", event),
    event.user ? getSlackUserEmail(event.user) : Promise.resolve(null),
  ]);

  if (thread_ts) {
    const messages = await getThread(channel, thread_ts, botUserId);
    const result = await generateResponse(
      messages,
      updateMessage,
      userEmail ?? undefined,
    );
    await updateMessage(result);
  } else {
    const result = await generateResponse(
      [{ role: "user", content: event.text }],
      updateMessage,
      userEmail ?? undefined,
    );
    await updateMessage(result);
  }
}