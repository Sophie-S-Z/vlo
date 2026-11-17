-- An index for the comments of one share link. add_comment counts the comments of a link, list_comments
-- reads them in order, and the daily clean-up deletes them with their link (on delete cascade). Without
-- the index, each of these reads every comment of every link. It changes no data and no function.

create index if not exists share_comments_share on public.share_comments (share_id, created_at);
