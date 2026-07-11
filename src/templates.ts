export interface EmailBody {
	subject: string;
	text: string;
	html: string;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function buildConfirmEmail(siteName: string, confirmUrl: string): EmailBody {
	const subject = `Confirm your ${siteName} subscription`;
	const text = `Click to confirm your subscription: ${confirmUrl}\n\nIf you didn't request this, ignore this email.`;
	const html = `<p>Click to confirm your subscription:</p><p><a href="${escapeHtml(confirmUrl)}">${escapeHtml(confirmUrl)}</a></p><p>If you didn't request this, ignore this email.</p>`;
	return { subject, text, html };
}

export function buildReplyNotificationEmail(
	siteName: string,
	authorName: string,
	commentUrl: string,
	unsubscribeUrl: string,
): EmailBody {
	const subject = `${authorName} replied on ${siteName}`;
	const text = `${authorName} just replied to a thread you're following:\n${commentUrl}\n\nUnsubscribe: ${unsubscribeUrl}`;
	const html = `<p><strong>${escapeHtml(authorName)}</strong> just replied to a thread you're following.</p><p><a href="${escapeHtml(commentUrl)}">Read the reply</a></p><p style="font-size:12px;color:#666"><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from this thread</a></p>`;
	return { subject, text, html };
}

export interface DigestItem {
	title: string;
	url: string;
}

export function buildDigestEmail(
	siteName: string,
	items: DigestItem[],
	unsubscribeUrl: string,
): EmailBody {
	const subject =
		items.length === 1 ? `New post on ${siteName}` : `${items.length} new posts on ${siteName}`;
	const text =
		items.map((i) => `${i.title}\n${i.url}`).join("\n\n") + `\n\nUnsubscribe: ${unsubscribeUrl}`;
	const html =
		`<ul>${items.map((i) => `<li><a href="${escapeHtml(i.url)}">${escapeHtml(i.title)}</a></li>`).join("")}</ul>` +
		`<p style="font-size:12px;color:#666"><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a></p>`;
	return { subject, text, html };
}
