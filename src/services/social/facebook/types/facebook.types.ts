export type FacebookResource =
  | 'page'
  | 'post'
  | 'comment'
  | 'photo'
  | 'video'
  | 'page_message'
  | 'leadgen'
  | 'event'
  | 'live_video'
  | 'album'
  | 'milestone'
  | 'offer'
  | 'job'
  | 'tag'
  | 'reaction'
  | 'custom';

export type FacebookOperation =
  | 'getAllPages'
  | 'getPageDetails'
  | 'updatePageSettings'
  | 'getPageInsights'
  | 'getPageFeed'
  | 'createTextPost'
  | 'createLinkPost'
  | 'createPhotoPost'
  | 'createVideoPost'
  | 'createCarouselPost'
  | 'createStoryPost'
  | 'schedulePost'
  | 'deletePost'
  | 'updatePost'
  | 'getPostInsights'
  | 'getPostComments'
  | 'createComment'
  | 'deleteComment'
  | 'updateComment'
  | 'hideComment'
  | 'unhideComment'
  | 'pinComment'
  | 'unpinComment'
  | 'likeComment'
  | 'unlikeComment'
  | 'getCommentReplies'
  | 'uploadPhoto'
  | 'uploadPhotoToPost'
  | 'getPageAlbums'
  | 'createAlbum'
  | 'deletePhoto'
  | 'uploadVideo'
  | 'getVideoStatus'
  | 'updateVideoSettings'
  | 'deleteVideo'
  | 'sendTextMessage'
  | 'sendQuickReplies'
  | 'sendTemplate'
  | 'sendAttachment'
  | 'markSeen'
  | 'typingOn'
  | 'typingOff'
  | 'getConversationHistory'
  | 'setMessengerProfile'
  | 'getLeadgenForms'
  | 'downloadLeads'
  | 'getLeadDetails'
  | 'createEvent'
  | 'getPageEvents'
  | 'updateEvent'
  | 'deleteEvent'
  | 'getEventResponses'
  | 'createLiveVideoStream'
  | 'getLiveVideoStatus'
  | 'endLiveStream'
  | 'getLiveVideoInsights'
  | 'getAlbums'
  | 'updateAlbumDetails'
  | 'addPhotosToAlbum'
  | 'removePhotosFromAlbum'
  | 'createMilestone'
  | 'getMilestones'
  | 'updateMilestone'
  | 'deleteMilestone'
  | 'createOffer'
  | 'getOffers'
  | 'claimOffer'
  | 'updateOfferStatus'
  | 'postJobOpening'
  | 'getJobListings'
  | 'updateJobStatus'
  | 'getJobApplications'
  | 'tagPageInPost'
  | 'tagFriendInPost'
  | 'removeTag'
  | 'getTaggedPosts'
  | 'reactToPost'
  | 'getReactionCounts'
  | 'removeReaction'
  | 'getUserReaction'
  | 'rawGraphApiCall'
  | 'batchRequests'
  | 'fieldExpansion';

export interface FacebookNodeParams {
  resource: FacebookResource;
  operation: FacebookOperation;
  accessToken?: string;
  pageId?: string;
  userId?: string;
  postId?: string;
  commentId?: string;
  endpoint?: string;
  method?: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';
  fields?: string;
  message?: string;
  link?: string;
  since?: string;
  until?: string;
  limit?: number;
  after?: string;
  before?: string;
  returnAll?: boolean;
  concurrency?: number;
  continueOnError?: boolean;
  logToSupabase?: boolean;
  syncTableName?: string;
  [key: string]: unknown;
}

export interface FacebookNodeResult {
  success: boolean;
  resource: FacebookResource;
  operation: FacebookOperation;
  data: Record<string, unknown>;
  error: {
    message: string;
    statusCode?: number;
    code?: string | number;
    type?: string;
    errorSubcode?: number;
    hint?: string;
  } | null;
  pagination?: {
    next?: string;
    previous?: string;
    cursors?: {
      before?: string;
      after?: string;
    };
  };
  meta?: {
    executionTimeMs: number;
    apiCallCount: number;
  };
}

export interface FacebookGraphError {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export interface FacebookOperationLog {
  id: string;
  operation: string;
  page_id: string | null;
  response_data: Record<string, unknown>;
  status: 'success' | 'failed';
  error_message?: string;
  execution_time_ms: number;
  api_call_count: number;
  created_at: string;
  sync_to_supabase: boolean;
}
