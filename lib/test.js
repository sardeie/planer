import { extractFrom } from './planer';

let msgBody = "Reply!\n\nOn 15-Dec-2011, at 6:54 PM, Sean Carter <s.carter@example.com> wrote:\n> It's the ROC!\n>-Sean";
let actualMessage = planer.extractFrom(msgBody, 'text/plain');
console.log(actualMessage);