export interface XhsRawUser {
    userId?: string;
    nickname?: string;
    nickName?: string;
    avatar?: string;
}
export interface XhsRawInteractInfo {
    liked?: boolean;
    likedCount?: string | number;
    collected?: boolean;
    collectedCount?: string | number;
    commentCount?: string | number;
    sharedCount?: string | number;
}
export interface XhsRawNoteCard {
    type?: string;
    displayTitle?: string;
    user?: XhsRawUser;
    interactInfo?: XhsRawInteractInfo;
    cover?: {
        width?: number;
        height?: number;
        url?: string;
        urlDefault?: string;
        urlPre?: string;
        fileId?: string;
    };
    video?: unknown;
}
export interface XhsRawSearchFeed {
    xsecToken?: string;
    id?: string;
    modelType?: string;
    noteCard?: XhsRawNoteCard;
    index?: number;
}
export interface XhsStructuredSearchExtraction {
    available: boolean;
    feeds: XhsRawSearchFeed[];
}
