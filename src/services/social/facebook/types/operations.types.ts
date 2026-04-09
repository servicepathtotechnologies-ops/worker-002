import { FacebookOperation, FacebookResource } from './facebook.types';

export const facebookOperationsByResource: Record<FacebookResource, FacebookOperation[]> = {
  page: ['getAllPages', 'getPageDetails', 'updatePageSettings', 'getPageInsights', 'getPageFeed'],
  post: [
    'createTextPost',
    'createLinkPost',
    'createPhotoPost',
    'createVideoPost',
    'createCarouselPost',
    'createStoryPost',
    'schedulePost',
    'deletePost',
    'updatePost',
    'getPostInsights',
    'getPostComments',
  ],
  comment: [
    'createComment',
    'deleteComment',
    'updateComment',
    'hideComment',
    'unhideComment',
    'pinComment',
    'unpinComment',
    'likeComment',
    'unlikeComment',
    'getCommentReplies',
  ],
  photo: ['uploadPhoto', 'uploadPhotoToPost', 'getPageAlbums', 'createAlbum', 'deletePhoto'],
  video: ['uploadVideo', 'getVideoStatus', 'updateVideoSettings', 'deleteVideo'],
  page_message: [
    'sendTextMessage',
    'sendQuickReplies',
    'sendTemplate',
    'sendAttachment',
    'markSeen',
    'typingOn',
    'typingOff',
    'getConversationHistory',
    'setMessengerProfile',
  ],
  leadgen: ['getLeadgenForms', 'downloadLeads', 'getLeadDetails'],
  event: ['createEvent', 'getPageEvents', 'updateEvent', 'deleteEvent', 'getEventResponses'],
  live_video: ['createLiveVideoStream', 'getLiveVideoStatus', 'endLiveStream', 'getLiveVideoInsights'],
  album: ['createAlbum', 'getAlbums', 'updateAlbumDetails', 'deletePhoto', 'addPhotosToAlbum', 'removePhotosFromAlbum'],
  milestone: ['createMilestone', 'getMilestones', 'updateMilestone', 'deleteMilestone'],
  offer: ['createOffer', 'getOffers', 'claimOffer', 'updateOfferStatus'],
  job: ['postJobOpening', 'getJobListings', 'updateJobStatus', 'getJobApplications'],
  tag: ['tagPageInPost', 'tagFriendInPost', 'removeTag', 'getTaggedPosts'],
  reaction: ['reactToPost', 'getReactionCounts', 'removeReaction', 'getUserReaction'],
  custom: ['rawGraphApiCall', 'batchRequests', 'fieldExpansion'],
};

export function isOperationAllowed(resource: FacebookResource, operation: FacebookOperation): boolean {
  return facebookOperationsByResource[resource]?.includes(operation) ?? false;
}
