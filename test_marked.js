import { marked } from 'marked';
const markdown = "![1000233588.jpg]\n(/api/media/file/images/2026/09/27fb1005-3520-4bc2-a750-f489e4b13a56.jpg)";
console.log(marked.parse(markdown));
