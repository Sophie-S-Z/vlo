/*
 * A WordPress import file (WXR 1.2) with one draft post (Phase 17 Publish). A self-hosted WordPress site has
 * its own host, which the CSP cannot list, so Vlo cannot send the post there. The writer imports the file
 * in Tools, Import, WordPress, and the post comes in as a draft. The importer gives it to the user that
 * the writer picks. The HTML goes in a Classic block, which the block editor can convert to blocks.
 */

import { xmlChars } from '@/features/export/xml';

export interface WxrPost {
  title: string;
  /** The excerpt, or ''. */
  excerpt: string;
  html: string;
  /** The time of the export, in milliseconds. */
  at: number;
}

/** CDATA cannot hold "]]>", so the text splits there into two CDATA sections. */
function cdata(text: string): string {
  return `<![CDATA[${xmlChars(text).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

/** A time as WordPress stores it: "2026-11-12 09:30:00", in UTC. */
function wpDate(at: number): string {
  return new Date(at).toISOString().slice(0, 19).replace('T', ' ');
}

export function toWxr(post: WxrPost): string {
  const date = wpDate(post.at);
  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>Vlo</title>
  <description>A draft from Vlo</description>
  <language>en</language>
  <wp:wxr_version>1.2</wp:wxr_version>
  <generator>Vlo</generator>
  <item>
    <title>${cdata(post.title)}</title>
    <description></description>
    <content:encoded>${cdata(post.html)}</content:encoded>
    <excerpt:encoded>${cdata(post.excerpt)}</excerpt:encoded>
    <wp:post_id>0</wp:post_id>
    <wp:post_date>${cdata(date)}</wp:post_date>
    <wp:post_date_gmt>${cdata(date)}</wp:post_date_gmt>
    <wp:comment_status>${cdata('open')}</wp:comment_status>
    <wp:ping_status>${cdata('open')}</wp:ping_status>
    <wp:post_name>${cdata('')}</wp:post_name>
    <wp:status>${cdata('draft')}</wp:status>
    <wp:post_parent>0</wp:post_parent>
    <wp:menu_order>0</wp:menu_order>
    <wp:post_type>${cdata('post')}</wp:post_type>
    <wp:post_password>${cdata('')}</wp:post_password>
    <wp:is_sticky>0</wp:is_sticky>
  </item>
</channel>
</rss>
`;
}
