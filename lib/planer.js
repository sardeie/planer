import htmlPlaner from './htmlPlaner';
import REGEXES from './regexes';

var CONTENT_CHUNK_SIZE, MAX_LINES_COUNT, MAX_LINE_LENGTH, REGEXES, SPLITTER_MAX_LINES, _CRLF_to_LF, _restore_CRLF, getDelimiter, htmlPlaner, isSplitter, postprocess, preprocess, setReturnFlags;

SPLITTER_MAX_LINES = 4;

MAX_LINES_COUNT = 1000;

MAX_LINE_LENGTH = 200000;

export const extractFrom = function(msgBody, contentType, dom) {
  if (contentType == null) {
    contentType = 'text/plain';
  }
  if (dom == null) {
    dom = null;
  }
  if (contentType === 'text/plain') {
    return extractFromPlain(msgBody);
  } else if (contentType === 'text/html') {
    return extractFromHtml(msgBody, dom);
  } else {
    console.warn('Unknown contentType', contentType);
  }
  return msgBody;
};

export const extractFromPlain = function(msgBody) {
  var delimiter, lines, markers;
  delimiter = getDelimiter(msgBody);
  msgBody = preprocess(msgBody, delimiter);
  lines = msgBody.split(delimiter, MAX_LINES_COUNT);
  markers = markMessageLines(lines);
  lines = processMarkedLines(lines, markers);
  msgBody = lines.join(delimiter);
  msgBody = postprocess(msgBody);
  return msgBody;
};

export const extractFromHtml = function(msgBody, dom) {
  var checkpoint, crlfReplaced, emailDocument, emailDocumentCopy, haveCutQuotations, i, index, k, l, len, len1, line, lineCheckpoints, lines, m, markers, matches, numberOfCheckpoints, plainTextMsg, quotationCheckpoints, ref, ref1, ref2, ref3, returnFlags;
  if (dom == null) {
    console.error("No dom provided to parse html.");
    return msgBody;
  }
  if (msgBody.trim() === '') {
    return msgBody;
  }
  ref = _CRLF_to_LF(msgBody), msgBody = ref[0], crlfReplaced = ref[1];
  emailDocument = htmlPlaner.createEmailDocument(msgBody, dom);
  haveCutQuotations = htmlPlaner.cutGmailQuote(emailDocument) || htmlPlaner.cutBlockQuote(emailDocument) || htmlPlaner.cutMicrosoftQuote(emailDocument) || htmlPlaner.cutById(emailDocument) || htmlPlaner.cutFromBlock(emailDocument);
  emailDocumentCopy = htmlPlaner.createEmailDocument(emailDocument.documentElement.outerHTML, dom);
  numberOfCheckpoints = htmlPlaner.addCheckpoints(emailDocument.body, 0);
  quotationCheckpoints = Array.apply(null, Array(numberOfCheckpoints)).map(function() {
    return false;
  });
  htmlPlaner.replaceBreakTagsWithLineFeeds(emailDocument);
  plainTextMsg = emailDocument.body.textContent;
  plainTextMsg = preprocess(plainTextMsg, "\n", 'text/html');
  lines = plainTextMsg.split('\n');
  if (lines.length > MAX_LINES_COUNT) {
    return msgBody;
  }
  lineCheckpoints = new Array(lines.length);
  for (index = k = 0, len = lines.length; k < len; index = ++k) {
    line = lines[index];
    matches = line.match(htmlPlaner.CHECKPOINT_PATTERN) || [];
    lineCheckpoints[index] = matches.map(function(match) {
      return parseInt(match.slice(4, -4));
    });
  }
  lines = lines.map(function(line) {
    return line.replace(htmlPlaner.CHECKPOINT_PATTERN, '');
  });
  markers = markMessageLines(lines);
  returnFlags = {};
  processMarkedLines(lines, markers, returnFlags);
  if (!returnFlags.wereLinesDeleted) {
    if (haveCutQuotations) {
      return _restore_CRLF(emailDocumentCopy.documentElement.outerHTML, crlfReplaced);
    } else {
      return msgBody;
    }
  }
  for (i = l = ref1 = returnFlags.firstLine, ref2 = returnFlags.lastLine; ref1 <= ref2 ? l <= ref2 : l >= ref2; i = ref1 <= ref2 ? ++l : --l) {
    if (!lineCheckpoints[i]) {
      continue;
    }
    ref3 = lineCheckpoints[i];
    for (m = 0, len1 = ref3.length; m < len1; m++) {
      checkpoint = ref3[m];
      quotationCheckpoints[checkpoint] = true;
    }
  }
  htmlPlaner.deleteQuotationTags(emailDocumentCopy.body, 0, quotationCheckpoints);
  return emailDocumentCopy.documentElement.outerHTML;
};

export const markMessageLines = function(lines) {
  var i, j, k, markers, ref, splitter, splitterLines;
  markers = [];
  i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === '') {
      markers[i] = 'e';
    } else if (REGEXES.QUOT_PATTERN.test(lines[i])) {
      markers[i] = 'm';
    } else if (REGEXES.FWD.test(lines[i])) {
      markers[i] = 'f';
    } else {
      splitter = isSplitter(lines.slice(i, i + SPLITTER_MAX_LINES).join("\n"));
      if (splitter) {
        splitterLines = splitter[0].split("\n");
        for (j = k = 0, ref = splitterLines.length; 0 <= ref ? k <= ref : k >= ref; j = 0 <= ref ? ++k : --k) {
          markers[i + j] = 's';
        }
        i += splitterLines.length - 1;
      } else {
        markers[i] = 't';
      }
    }
    i++;
  }
  return markers.join('');
};

isSplitter = function(line) {
  var k, len, matchArray, pattern, ref;
  if (line.length > MAX_LINE_LENGTH) {
    return null;
  }
  ref = REGEXES.SPLITTER_PATTERNS;
  for (k = 0, len = ref.length; k < len; k++) {
    pattern = ref[k];
    matchArray = pattern.exec(line);
    if (matchArray && matchArray.index === 0) {
      return matchArray;
    }
  }
  return null;
};

export const processMarkedLines = function(lines, markers, returnFlags) {
  var inlineMatchRegex, inlineReplyIndex, inlineReplyMatch, isInlineReplyLink, quotationEnd, quotationMatch;
  if (returnFlags == null) {
    returnFlags = {};
  }
  if (markers.indexOf('s') < 0 && !/(me*){3}/.test(markers)) {
    markers = markers.replace(/m/g, 't');
  }
  if (/^[te]*f/.test(markers)) {
    setReturnFlags(returnFlags, false, -1, -1);
    return lines;
  }
  inlineMatchRegex = new RegExp('m(?=e*((?:t+e*)+)m)', 'g');
  while (inlineReplyMatch = inlineMatchRegex.exec(lines)) {
    inlineReplyIndex = markers.indexOf(inlineReplyMatch[1], inlineReplyMatch.index);
    isInlineReplyLink = false;
    if (inlineReplyIndex > -1) {
      isInlineReplyLink = REGEXES.PARENTHESIS_LINK.test(lines[inlineReplyIndex - 1]) || lines[inlineReplyIndex].trim().search(REGEXES.PARENTHESIS_LINK) === 0;
    }
    if (!isInlineReplyLink) {
      setReturnFlags(returnFlags, false, -1, -1);
      return lines;
    }
  }
  quotationMatch = new RegExp('(se*)+((t|f)+e*)+', 'g').exec(markers);
  if (quotationMatch) {
    setReturnFlags(returnFlags, true, quotationMatch.index, lines.length);
    return lines.slice(0, quotationMatch.index);
  }
  quotationMatch = REGEXES.QUOTATION.exec(markers) || REGEXES.EMPTY_QUOTATION.exec(markers);
  if (quotationMatch) {
    quotationEnd = quotationMatch.index + quotationMatch[1].length;
    setReturnFlags(returnFlags, true, quotationMatch.index, quotationEnd);
    return lines.slice(0, quotationMatch.index).concat(lines.slice(quotationEnd));
  }
  setReturnFlags(returnFlags, false, -1, -1);
  return lines;
};

setReturnFlags = function(returnFlags, wereLinesDeleted, firstLine, lastLine) {
  returnFlags.wereLinesDeleted = wereLinesDeleted;
  returnFlags.firstLine = firstLine;
  return returnFlags.lastLine = lastLine;
};

preprocess = function(msgBody, delimiter, contentType) {
  if (contentType == null) {
    contentType = 'text/plain';
  }
  msgBody = msgBody.replace(REGEXES.LINK, function(entireMatch, groupMatch1, matchIndex) {
    var newLineIndex;
    newLineIndex = msgBody.lastIndexOf("\n", matchIndex);
    if (newLineIndex > 0 && msgBody[newLineIndex + 1] === '>') {
      return entireMatch;
    } else {
      return "@@" + groupMatch1 + "@@";
    }
  });
  if (contentType === 'text/plain' && msgBody.length < MAX_LINE_LENGTH) {
    msgBody = msgBody.replace(REGEXES.ON_DATE_SMB_WROTE, function(entireMatch, groupMatch1, groupMatch2, groupMatch3, groupMatch4, matchIndex) {
      if (matchIndex && msgBody[matchIndex - 1] !== "\n") {
        return "" + delimiter + entireMatch;
      } else {
        return entireMatch;
      }
    });
  }
  return msgBody;
};

postprocess = function(msgBody) {
  return msgBody.replace(REGEXES.NORMALIZED_LINK, '<$1>').trim();
};

CONTENT_CHUNK_SIZE = 100;

getDelimiter = function(msgBody) {
  var bodyChunk, contentLength, currentIndex, delimiterMatch;
  contentLength = msgBody.length;
  currentIndex = 0;
  bodyChunk = msgBody.substr(currentIndex, CONTENT_CHUNK_SIZE);
  while (!(delimiterMatch = REGEXES.DELIMITER.exec(bodyChunk)) && currentIndex < contentLength) {
    currentIndex += CONTENT_CHUNK_SIZE;
    bodyChunk = msgBody.substr(currentIndex, CONTENT_CHUNK_SIZE);
  }
  if (delimiterMatch) {
    return delimiterMatch[0];
  } else {
    return "\n";
  }
};

_CRLF_to_LF = function(msgBody) {
  var delimiter;
  delimiter = getDelimiter(msgBody);
  if (delimiter === '\r\n') {
    return [msgBody.replace(new RegExp(delimiter, 'g'), '\n'), true];
  }
  return [msgBody, false];
};

_restore_CRLF = function(msgBody, replaced) {
  if (replaced == null) {
    replaced = true;
  }
  if (replaced) {
    return msgBody.replace(new RegExp('\n', 'g'), '\r\n');
  }
  return msgBody;
};