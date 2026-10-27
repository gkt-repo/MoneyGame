export const roomInvitationLink = (code: string) =>
  `https://mgame-1.web.app/join/${encodeURIComponent(code)}`;

export const roomInvitationMessage = (code: string) =>
  `Join my room: ${roomInvitationLink(code)}\nLog in if asked. Room code: ${code} (filled in automatically).`;
