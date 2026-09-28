const content = `The tool I'm talking about is called **AntiKnife**.

![1000233588.jpg](/api/media/file/images/2026/09/27fb1005-3520-4bc2-a750-f489e4b13a56.jpg)

It's completely changed how I work. Highly recommend`;

const r1 = /!\[.*?\]\((.*?)\)/.test(content);
const r2 = /https?:\/\/[^\s)"]+(?:images|videos|audio|files)\/\d{4}\/\d{2}\/[^/\\s?#]+\.[a-z0-9]+/i.test(content);

console.log('r1:', r1);
console.log('r2:', r2);
