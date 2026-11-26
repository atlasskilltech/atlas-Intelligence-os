import { getSendGridConfig } from "@/lib/config/env";
import { buildEmail, sendMail } from "@/lib/connectors/email/emailConnector";
import { getActor } from "@/lib/context";
import { BadRequest, fail, ok } from "@/lib/http/respond";
import { getSenderFor } from "@/lib/email/senderSettings";

/** Sends a test email from the user's sender to the user's own inbox. */
export async function POST() {
  try {
    const actor = await getActor();
    const cfg = getSendGridConfig();
    if (!cfg) throw new BadRequest("Email is not set up on the server (SENDGRID_API_KEY is missing).");
    if (!actor.email) throw new BadRequest("Your account has no email address, so there is nowhere to send the test.");
    const from = await getSenderFor(actor.id);
    const mail = buildEmail({
      subject: "IntelligenceOS test email",
      message: `This is a test email from IntelligenceOS.\n\nYour agents' emails will come from ${from.name} <${from.email}>.`,
      agentName: "Email sender settings",
    });
    try {
      await sendMail({ apiKey: cfg.apiKey, to: actor.email, from, mail });
    } catch (err) {
      throw new BadRequest(err?.message || "SendGrid could not send the email.");
    }
    return ok({ sent: true, to: actor.email, from: from.email });
  } catch (err) {
    return fail(err);
  }
}
