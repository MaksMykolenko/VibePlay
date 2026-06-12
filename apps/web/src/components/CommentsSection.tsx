import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useGames } from '../hooks/useGames';
import type { Comment } from '../types';
import { ThumbsUp, Trash2, AlertOctagon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from './toastEvents';

interface CommentsSectionProps {
  gameId: string;
}

export const CommentsSection: React.FC<CommentsSectionProps> = ({ gameId }) => {
  const { currentUser } = useAuth();
  const { comments, addComment, likeComment, deleteComment, submitReport } = useGames();
  const [newCommentText, setNewCommentText] = useState('');

  // Filtering comments for this game only
  const gameComments = comments
    .filter((c) => c.gameId === gameId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      toast.danger('You must be logged in to comment.');
      return;
    }
    if (!newCommentText.trim()) {
      toast.warning('Please enter a comment.');
      return;
    }
    if (newCommentText.length > 300) {
      toast.warning('Comment is too long (max 300 characters).');
      return;
    }

    addComment(
      gameId,
      currentUser.id,
      currentUser.displayName,
      currentUser.avatar,
      newCommentText.trim(),
    );

    setNewCommentText('');
    toast.success('Comment posted successfully!');
  };

  const handleLikeClick = (commentId: string) => {
    if (!currentUser) {
      toast.info('Please log in to like comments.');
      return;
    }
    likeComment(commentId, currentUser.id);
  };

  const handleDeleteClick = (commentId: string) => {
    if (window.confirm('Are you sure you want to delete this comment?')) {
      deleteComment(commentId);
      toast.success('Comment deleted.');
    }
  };

  const handleReportComment = (comment: Comment) => {
    if (!currentUser) {
      toast.info('Please log in to report comments.');
      return;
    }
    const reason = window.prompt('Specify the reason for reporting this comment:');
    if (reason && reason.trim()) {
      submitReport(
        currentUser.id,
        currentUser.displayName,
        'comment',
        comment.id,
        `Comment by @${comment.username}`,
        reason.trim(),
      );
      toast.success('Thank you. The comment has been flagged for admin review.');
    }
  };

  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div style={containerStyle}>
      <h3 style={sectionTitleStyle}>Comments ({gameComments.length})</h3>

      {/* Post comment block */}
      {currentUser ? (
        <form onSubmit={handleCommentSubmit} style={formStyle}>
          <div style={inputContainerStyle}>
            <img src={currentUser.avatar} alt="You" style={avatarStyle} />
            <textarea
              placeholder="Leave a helpful comment about the gameplay, controls or bugs..."
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              maxLength={300}
              style={textareaStyle}
            />
          </div>
          <div style={formFooterStyle}>
            <span style={charCountStyle}>{newCommentText.length} / 300</span>
            <button type="submit" className="btn btn-primary btn-sm">
              Post Comment
            </button>
          </div>
        </form>
      ) : (
        <div style={loginCTAStyle}>
          <p>Want to join the conversation?</p>
          <Link to="/login" className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }}>
            Log in to comment
          </Link>
        </div>
      )}

      {/* List comments */}
      <div style={listStyle}>
        {gameComments.length === 0 ? (
          <div style={emptyCommentsStyle}>
            No comments yet. Be the first to share your thoughts!
          </div>
        ) : (
          gameComments.map((c) => (
            <div key={c.id} style={commentCardStyle} className="animate-fade">
              <img src={c.userAvatar} alt={c.username} style={commentAvatarStyle} />

              <div style={commentBodyStyle}>
                <div style={commentHeaderStyle}>
                  <div>
                    <span style={displayNameStyle}>{c.username}</span>
                    <span style={timestampStyle}>{timeAgo(c.timestamp)}</span>
                  </div>

                  {/* Actions */}
                  <div style={actionsContainerStyle}>
                    {currentUser && currentUser.id === c.userId ? (
                      <button
                        onClick={() => handleDeleteClick(c.id)}
                        style={actionIconBtnDangerStyle}
                        title="Delete comment"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReportComment(c)}
                        style={actionIconBtnStyle}
                        title="Report comment"
                      >
                        <AlertOctagon size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <p style={contentStyle}>{c.content}</p>

                {/* Like button */}
                <div style={commentFooterStyle}>
                  <button
                    onClick={() => handleLikeClick(c.id)}
                    style={{
                      ...likeBtnStyle,
                      color: c.userLiked ? 'var(--secondary)' : 'var(--text-secondary)',
                    }}
                  >
                    <ThumbsUp size={12} fill={c.userLiked ? 'var(--secondary)' : 'none'} />
                    <span>{c.likes}</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Styles
const containerStyle: React.CSSProperties = {
  marginTop: '2rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: 700,
};

const formStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  padding: '1.25rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const inputContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  alignItems: 'flex-start',
};

const avatarStyle: React.CSSProperties = {
  width: '40px',
  height: '40px',
  borderRadius: '50%',
  objectFit: 'cover',
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  backgroundColor: 'var(--bg-surface)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  padding: '0.75rem',
  fontFamily: 'inherit',
  fontSize: '0.9rem',
  minHeight: '80px',
  resize: 'vertical',
  outline: 'none',
};

const formFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingLeft: '52px', // Align with textarea start
};

const charCountStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
};

const loginCTAStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  border: '1px dashed var(--border-color)',
  borderRadius: '12px',
  padding: '2rem',
  textAlign: 'center',
  color: 'var(--text-secondary)',
  fontSize: '0.9rem',
};

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const emptyCommentsStyle: React.CSSProperties = {
  textAlign: 'center',
  color: 'var(--text-secondary)',
  fontSize: '0.9rem',
  padding: '2rem',
};

const commentCardStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  alignItems: 'flex-start',
  padding: '1rem 0',
  borderBottom: '1px solid var(--border-color)',
};

const commentAvatarStyle: React.CSSProperties = {
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  objectFit: 'cover',
};

const commentBodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
};

const commentHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const displayNameStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: '0.9rem',
  color: 'var(--text-primary)',
  marginRight: '0.5rem',
};

const timestampStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
};

const contentStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: 'var(--text-primary)',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const commentFooterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  marginTop: '0.25rem',
};

const likeBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  background: 'none',
  border: 'none',
  fontSize: '0.75rem',
  cursor: 'pointer',
  transition: 'color 0.2s',
  padding: '2px 6px',
  marginLeft: '-6px',
};

const actionsContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
};

const actionIconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  opacity: 0.5,
  transition: 'opacity 0.2s, color 0.2s',
  padding: '4px',
};

// Hover rule managed by JS inline or CSS:
// .actionIconBtnStyle:hover { opacity: 1; color: var(--text-primary); }

const actionIconBtnDangerStyle: React.CSSProperties = {
  ...actionIconBtnStyle,
  color: 'var(--danger)',
};
