import { TableKit } from '@tiptap/extension-table';
import { MediaImage } from './mediaImage.js';
import { InlineImage } from './inlineImage.js';
import { VideoEmbed } from './videoEmbed.js';
import { MediaGrid } from './mediaGrid.js';
import { EditorialWrap } from './editorialWrap.js';
import { EditorialClear } from './editorialClear.js';
import { RawBlock } from './rawBlock.js';

export {
  MediaImage,
  InlineImage,
  VideoEmbed,
  MediaGrid,
  EditorialWrap,
  EditorialClear,
  RawBlock
};

// TableKit is shared by the Visual editor and the fidelity markdown manager:
// without a table node in the schema, marked's table tokens have nowhere to
// go and a GFM table is silently DROPPED from the document on load.
export const customEditorialExtensions = [
  TableKit,
  MediaImage,
  InlineImage,
  VideoEmbed,
  MediaGrid,
  EditorialWrap,
  EditorialClear,
  RawBlock
];
