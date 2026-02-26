// LinkedIn API Helper Functions
// Provides reusable functions for various LinkedIn API operations

export interface LinkedInProfile {
  id: string;
  localizedFirstName?: string;
  localizedLastName?: string;
  localizedHeadline?: string;
  profilePicture?: {
    displayImage?: string;
  };
  // LinkedIn OIDC userinfo fields (when using linkedin_oidc provider/scopes)
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
}

export interface LinkedInPost {
  id: string;
  author?: string;
  created?: {
    time?: number;
  };
  specificContent?: {
    'com.linkedin.ugc.ShareContent'?: {
      shareCommentary?: {
        text?: string;
      };
    };
  };
}

function normalizePersonUrn(personUrnOrId: string): string {
  if (!personUrnOrId) return '';
  return personUrnOrId.startsWith('urn:li:person:')
    ? personUrnOrId
    : `urn:li:person:${personUrnOrId}`;
}

/**
 * Get LinkedIn user profile
 */
export async function getLinkedInProfile(accessToken: string): Promise<LinkedInProfile> {
  // Prefer OIDC userinfo endpoint (works with scopes: openid profile email)
  // Fallback to legacy /v2/me for older apps/scopes.
  const userInfoResp = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (userInfoResp.ok) {
    const json = (await userInfoResp.json()) as {
      sub?: string;
      name?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
      email?: string;
    };

    if (!json.sub) {
      // Unexpected, but don't fail hard; try legacy endpoint.
      // eslint-disable-next-line no-console
      console.warn('[LinkedIn API] /v2/userinfo missing sub; falling back to /v2/me');
    } else {
      return {
        id: json.sub,
        name: json.name,
        given_name: json.given_name,
        family_name: json.family_name,
        picture: json.picture,
        email: json.email,
      };
    }
  }

  // Legacy endpoint
  const meResp = await fetch('https://api.linkedin.com/v2/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!meResp.ok) {
    const errorText = await meResp.text();
    const userInfoErrText = await userInfoResp.text().catch(() => '');
    throw new Error(
      `LinkedIn API error: /v2/userinfo (${userInfoResp.status}) ${userInfoErrText.slice(0, 200)}; ` +
      `/v2/me (${meResp.status}) ${errorText.slice(0, 200)}`
    );
  }

  return (await meResp.json()) as LinkedInProfile;
}

/**
 * Get LinkedIn user posts
 */
export async function getLinkedInPosts(
  accessToken: string,
  personUrn: string,
  count: number = 10
): Promise<LinkedInPost[]> {
  // Use UGC Posts API to get user's posts
  const authorUrn = normalizePersonUrn(personUrn);
  const queryParams = new URLSearchParams({
    q: 'authors',
    authors: `List(${authorUrn})`,
    count: count.toString(),
  });

  const response = await fetch(
    `https://api.linkedin.com/v2/ugcPosts?${queryParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LinkedIn API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { elements?: LinkedInPost[] };
  return data.elements || [];
}

export type LinkedInMediaKind = 'image' | 'video';

/**
 * Register a LinkedIn media upload for a member post.
 * Returns the asset URN and the upload URL where the raw bytes must be sent.
 */
export async function registerLinkedInUpload(
  accessToken: string,
  ownerUrn: string,
  kind: LinkedInMediaKind
): Promise<{ assetUrn: string; uploadUrl: string }> {
  const owner = normalizePersonUrn(ownerUrn);
  const recipe =
    kind === 'video'
      ? 'urn:li:digitalmediaRecipe:feedshare-video'
      : 'urn:li:digitalmediaRecipe:feedshare-image';

  const body = {
    registerUploadRequest: {
      owner,
      recipes: [recipe],
      serviceRelationships: [
        {
          relationshipType: 'OWNER',
          identifier: 'urn:li:userGeneratedContent',
        },
      ],
    },
  };

  const response = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LinkedIn registerUpload error (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const json = (await response.json()) as {
    value?: {
      asset?: string;
      uploadMechanism?: {
        'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'?: {
          uploadUrl?: string;
        };
      };
    };
  };

  const assetUrn = json.value?.asset;
  const uploadUrl =
    json.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']
      ?.uploadUrl;

  if (!assetUrn || !uploadUrl) {
    throw new Error('[LinkedIn API] registerUpload response missing asset or uploadUrl');
  }

  return { assetUrn, uploadUrl };
}

/**
 * Download media from a public URL and upload it to the LinkedIn upload URL.
 * Returns basic metadata about the uploaded file.
 */
export async function uploadLinkedInMediaFromUrl(
  uploadUrl: string,
  mediaUrl: string,
  overrideContentType?: string
): Promise<{ contentType: string; size: number }> {
  const mediaResp = await fetch(mediaUrl);
  if (!mediaResp.ok) {
    const errorText = await mediaResp.text().catch(() => '');
    throw new Error(
      `[LinkedIn API] Failed to download media from mediaUrl (${mediaResp.status}): ${errorText.slice(
        0,
        300
      )}`
    );
  }

  const contentType =
    overrideContentType ||
    mediaResp.headers.get('content-type') ||
    'application/octet-stream';

  const arrayBuffer = await mediaResp.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: buffer,
  });

  if (!uploadResp.ok) {
    const errorText = await uploadResp.text().catch(() => '');
    throw new Error(
      `LinkedIn media upload error (${uploadResp.status}): ${errorText.slice(0, 300)}`
    );
  }

  return { contentType, size: buffer.byteLength };
}

/**
 * Create a LinkedIn post
 */
export async function createLinkedInPost(
  accessToken: string,
  personUrn: string,
  text: string,
  visibility: 'PUBLIC' | 'CONNECTIONS' = 'PUBLIC'
): Promise<{ id: string }> {
  const author = normalizePersonUrn(personUrn);
  const requestBody = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
          text,
        },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': visibility === 'CONNECTIONS' ? 'CONNECTIONS' : 'PUBLIC',
    },
  };

  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LinkedIn API error (${response.status}): ${errorText}`);
  }

  return (await response.json()) as { id: string };
}

/**
 * Create a LinkedIn media post (image or video) for a member profile.
 */
export async function createLinkedInMediaPost(
  accessToken: string,
  personUrn: string,
  text: string,
  assetUrn: string,
  kind: LinkedInMediaKind,
  visibility: 'PUBLIC' | 'CONNECTIONS' = 'PUBLIC'
): Promise<{ id: string }> {
  const author = normalizePersonUrn(personUrn);
  const mediaCategory = kind === 'video' ? 'VIDEO' : 'IMAGE';

  const requestBody = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
          text,
        },
        shareMediaCategory: mediaCategory,
        media: [
          {
            status: 'READY',
            media: assetUrn,
          },
        ],
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility':
        visibility === 'CONNECTIONS' ? 'CONNECTIONS' : 'PUBLIC',
    },
  };

  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LinkedIn media post error (${response.status}): ${errorText.slice(0, 300)}`);
  }

  return (await response.json()) as { id: string };
}

/**
 * Delete a LinkedIn post
 */
export async function deleteLinkedInPost(accessToken: string, postUrn: string): Promise<void> {
  const response = await fetch(`https://api.linkedin.com/v2/ugcPosts/${postUrn}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LinkedIn API error (${response.status}): ${errorText}`);
  }
}

/**
 * Get person URN from access token (extracts from /v2/me response)
 */
export async function getPersonUrnFromToken(accessToken: string): Promise<string> {
  const profile = await getLinkedInProfile(accessToken);
  // LinkedIn returns either:
  // - OIDC: profile.id == sub (member id)
  // - Legacy: profile.id might be "urn:li:person:xxxxx" or just "xxxxx"
  if (!profile.id) return '';
  return profile.id.startsWith('urn:li:person:')
    ? profile.id.replace('urn:li:person:', '')
    : profile.id;
}
