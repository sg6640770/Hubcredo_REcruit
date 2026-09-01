import { Inbox } from 'lucide-react';

export default function InboxPage() {
  return (
    <div className="clients-page recruit-clients-page">
      <div className="recruit-page-header">
        <div>
          <h1>Inbox</h1>
          <p>Replies from your outreach campaigns</p>
        </div>
      </div>
      <div className="recruit-empty">
        <div className="recruit-empty-icon"><Inbox size={33} /></div>
        <h3>No replies yet</h3>
        <p>When candidates reply to your outreach sequences, their messages will appear here.</p>
      </div>
    </div>
  );
}
