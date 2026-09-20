import React from 'react';
import { marked } from 'marked';

export default function RichViewer({ content = '' }) {
  if (!content) return null;

  // Custom processing for video embeds (YouTube / MP4) before rendering HTML
  const processEmbeds = (rawText) => {
    let processed = rawText ? String(rawText).replace(/\\n/g, '\n') : '';

    // Convert standalone YouTube URLs into iframe embeds
    // e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ or https://youtu.be/dQw4w9WgXcQ
    const youtubeRegex = /(?:^|\n)(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:\S*)?/g;
    processed = processed.replace(youtubeRegex, (match, videoId) => {
      return `\n<div class="video-responsive"><iframe src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>\n`;
    });

    // Convert standalone mp4/webm video URLs into HTML5 video tags
    const videoFileRegex = /(?:^|\n)(https?:\/\/\S+\.(?:mp4|webm)|^\/uploads\/\S+\.(?:mp4|webm))/gi;
    processed = processed.replace(videoFileRegex, (match, videoUrl) => {
      return `\n<div class="video-responsive"><video controls src="${videoUrl}"></video></div>\n`;
    });

    return processed;
  };

  const processedContent = processEmbeds(content);
  const rawHtml = marked.parse(processedContent, {
    gfm: true,
    breaks: true
  });
  const htmlContent = typeof rawHtml === 'string'
    ? rawHtml.replace(/<img /gi, '<img loading="lazy" decoding="async" onerror="if(!this.dataset.refreshed){this.dataset.refreshed=\'true\';fetch(\'/api/b2/refresh?url=\'+encodeURIComponent(this.src)).then(r=>r.json()).then(d=>{if(d.url){this.src=d.url;}}).catch(()=>{});}" ')
    : rawHtml;

  return (
    <div
      className="prose-editorial"
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
