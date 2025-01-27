var BREAK_TAG_REGEX, CHECKPOINT_PREFIX, CHECKPOINT_SUFFIX, DOCUMENT_POSITION_FOLLOWING, DOCUMENT_POSITION_PRECEDING, OUTLOOK_SPLITTER_QUERY_SELECTORS, OUTLOOK_SPLITTER_QUOTE_IDS, OUTLOOK_XPATH_SPLITTER_QUERIES, QUOTE_IDS, compareByDomPosition, elementIsAllContent, ensureTextNodeBetweenChildElements, findMicrosoftSplitter, findOutlookSplitterWithQuerySelector, findOutlookSplitterWithQuoteId, findOutlookSplitterWithXpathQuery, findParentDiv, hasTagName, isTextNodeWrappedInSpan, removeNodes;

CHECKPOINT_PREFIX = '#!%!';

CHECKPOINT_SUFFIX = '!%!#';

export const CHECKPOINT_PATTERN = new RegExp(CHECKPOINT_PREFIX + "\\d+" + CHECKPOINT_SUFFIX, 'g');

QUOTE_IDS = ['OLK_SRC_BODY_SECTION'];

export const createEmailDocument = function(msgBody, dom) {
  var emailBodyElement, emailDocument, head, htmlElement;
  emailDocument = dom.implementation.createHTMLDocument();
  htmlElement = emailDocument.getElementsByTagName('html')[0];
  htmlElement.innerHTML = msgBody.trim();
  if (emailDocument.body == null) {
    emailBodyElement = emailDocument.getElementsByTagName('body')[0];
    emailDocument.body = emailBodyElement;
  }
  head = emailDocument.getElementsByTagName('head')[0];
  if (head) {
    emailDocument.documentElement.removeChild(head);
  }
  return emailDocument;
};

export const addCheckpoints = function(htmlNode, counter) {
  var childNode, i, len, ref;
  if (htmlNode.nodeType === 3) {
    htmlNode.nodeValue = "" + (htmlNode.nodeValue.trim()) + CHECKPOINT_PREFIX + counter + CHECKPOINT_SUFFIX + "\n";
    counter++;
  }
  if (htmlNode.nodeType === 1) {
    if (!hasTagName(htmlNode, 'body')) {
      htmlNode.innerHTML = "  " + htmlNode.innerHTML + "  ";
    }
    ensureTextNodeBetweenChildElements(htmlNode);
    ref = htmlNode.childNodes;
    for (i = 0, len = ref.length; i < len; i++) {
      childNode = ref[i];
      counter = addCheckpoints(childNode, counter);
    }
  }
  return counter;
};

export const deleteQuotationTags = function(htmlNode, counter, quotationCheckpoints) {
  var childNode, childTagInQuotation, i, j, len, len1, quotationChildren, ref, ref1, tagInQuotation;
  tagInQuotation = true;
  if (htmlNode.nodeType === 3) {
    if (!quotationCheckpoints[counter]) {
      tagInQuotation = false;
    }
    counter++;
    return [counter, tagInQuotation];
  }
  if (htmlNode.nodeType === 1) {
    childTagInQuotation = false;
    quotationChildren = [];
    if (!hasTagName(htmlNode, 'body')) {
      htmlNode.innerHTML = "  " + htmlNode.innerHTML + "  ";
    }
    ensureTextNodeBetweenChildElements(htmlNode);
    ref = htmlNode.childNodes;
    for (i = 0, len = ref.length; i < len; i++) {
      childNode = ref[i];
      ref1 = deleteQuotationTags(childNode, counter, quotationCheckpoints), counter = ref1[0], childTagInQuotation = ref1[1];
      tagInQuotation = tagInQuotation && childTagInQuotation;
      if (childTagInQuotation) {
        quotationChildren.push(childNode);
      }
    }
  }
  if (tagInQuotation) {
    return [counter, tagInQuotation];
  } else {
    for (j = 0, len1 = quotationChildren.length; j < len1; j++) {
      childNode = quotationChildren[j];
      htmlNode.removeChild(childNode);
    }
    return [counter, tagInQuotation];
  }
};

export const cutGmailQuote = function(emailDocument) {
  var nodesArray;
  nodesArray = emailDocument.getElementsByClassName('gmail_quote');
  if (!(nodesArray.length > 0)) {
    return false;
  }
  removeNodes(nodesArray);
  return true;
};

export const cutMicrosoftQuote = function(emailDocument) {
  var afterSplitter, parentElement, splitterElement;
  splitterElement = findMicrosoftSplitter(emailDocument);
  if (splitterElement == null) {
    return false;
  }
  parentElement = splitterElement.parentElement;
  afterSplitter = splitterElement.nextElementSibling;
  while (afterSplitter != null) {
    parentElement.removeChild(afterSplitter);
    afterSplitter = splitterElement.nextElementSibling;
  }
  parentElement.removeChild(splitterElement);
  return true;
};

export const cutBlockQuote = function(emailDocument) {
  var blockquoteElement, div, parent, xpathQuery, xpathResult;
  xpathQuery = '(.//blockquote)[not(ancestor::blockquote)][last()]';
  xpathResult = emailDocument.evaluate(xpathQuery, emailDocument, null, 9, null);
  blockquoteElement = xpathResult.singleNodeValue;
  if (blockquoteElement == null) {
    return false;
  }
  div = emailDocument.createElement('div');
  parent = blockquoteElement.parentElement;
  parent.removeChild(blockquoteElement);
  return true;
};

export const cutById = function(emailDocument) {
  var found, i, len, quoteElement, quoteId;
  found = false;
  for (i = 0, len = QUOTE_IDS.length; i < len; i++) {
    quoteId = QUOTE_IDS[i];
    quoteElement = emailDocument.getElementById(quoteId);
    if (quoteElement != null) {
      found = true;
      quoteElement.parentElement.removeChild(quoteElement);
    }
  }
  return found;
};

export const cutFromBlock = function(emailDocument) {
  var afterSplitter, fromBlock, lastBlock, parentDiv, ref, splitterElement, textNode, xpathQuery, xpathResult;
  xpathQuery = "//*[starts-with(normalize-space(.), 'From:')]|//*[starts-with(normalize-space(.), 'Date:')]";
  xpathResult = emailDocument.evaluate(xpathQuery, emailDocument, null, 5, null);
  while (fromBlock = xpathResult.iterateNext()) {
    lastBlock = fromBlock;
  }
  if (lastBlock != null) {
    parentDiv = findParentDiv(lastBlock);
    if ((parentDiv != null) && !elementIsAllContent(parentDiv)) {
      parentDiv.parentElement.removeChild(parentDiv);
      return true;
    }
  }
  xpathQuery = "//text()[starts-with(normalize-space(.), 'From:')]|//text()[starts-with(normalize-space(.), 'Date:')]";
  xpathResult = emailDocument.evaluate(xpathQuery, emailDocument, null, 9, null);
  textNode = xpathResult.singleNodeValue;
  if (textNode == null) {
    return false;
  }
  if (isTextNodeWrappedInSpan(textNode)) {
    return false;
  }
  splitterElement = textNode.previousSibling;
  if (splitterElement != null) {
    if ((ref = splitterElement.parentElement) != null) {
      ref.removeChild(splitterElement);
    }
  }
  afterSplitter = textNode.nextSibling;
  while (afterSplitter != null) {
    afterSplitter.parentNode.removeChild(afterSplitter);
    afterSplitter = textNode.nextSibling;
  }
  textNode.parentNode.removeChild(textNode);
  return true;
};

findParentDiv = function(element) {
  while ((element != null) && (element.parentElement != null)) {
    if (hasTagName(element, 'div')) {
      return element;
    } else {
      element = element.parentElement;
    }
  }
  return null;
};

elementIsAllContent = function(element) {
  var maybeBody;
  maybeBody = element.parentElement;
  return (maybeBody != null) && hasTagName(maybeBody, 'body') && maybeBody.childNodes.length === 1;
};

isTextNodeWrappedInSpan = function(textNode) {
  var parentElement;
  parentElement = textNode.parentElement;
  return (parentElement != null) && hasTagName(parentElement, 'span') && parentElement.childNodes.length === 1;
};

BREAK_TAG_REGEX = new RegExp('<br\\s*[/]?>', 'gi');

export const replaceBreakTagsWithLineFeeds = function(emailDocument) {
  var currentHtml;
  currentHtml = emailDocument.body.innerHTML;
  return emailDocument.body.innerHTML = currentHtml.replace(BREAK_TAG_REGEX, "\n");
};

OUTLOOK_SPLITTER_QUERY_SELECTORS = {
  outlook2007: "div[style='border:none;border-top:solid #B5C4DF 1.0pt;padding:3.0pt 0cm 0cm 0cm']",
  outlookForAndroid: "div[style='border:none;border-top:solid #E1E1E1 1.0pt;padding:3.0pt 0cm 0cm 0cm']",
  windowsMail: "div[style='padding-top: 5px; border-top-color: rgb(229, 229, 229); border-top-width: 1px; border-top-style: solid;']"
};

OUTLOOK_XPATH_SPLITTER_QUERIES = {
  outlook2003: "//div/div[@class='MsoNormal' and @align='center' and @style='text-align:center']/font/span/hr[@size='3' and @width='100%' and @align='center' and @tabindex='-1']"
};

OUTLOOK_SPLITTER_QUOTE_IDS = {
  office365: '#divRplyFwdMsg'
};

findMicrosoftSplitter = function(emailDocument) {
  var _, possibleSplitterElements, querySelector, quoteId, splitterElement, xpathQuery;
  possibleSplitterElements = [];
  for (_ in OUTLOOK_SPLITTER_QUERY_SELECTORS) {
    querySelector = OUTLOOK_SPLITTER_QUERY_SELECTORS[_];
    if ((splitterElement = findOutlookSplitterWithQuerySelector(emailDocument, querySelector))) {
      possibleSplitterElements.push(splitterElement);
    }
  }
  for (_ in OUTLOOK_XPATH_SPLITTER_QUERIES) {
    xpathQuery = OUTLOOK_XPATH_SPLITTER_QUERIES[_];
    if ((splitterElement = findOutlookSplitterWithXpathQuery(emailDocument, xpathQuery))) {
      possibleSplitterElements.push(splitterElement);
    }
  }
  for (_ in OUTLOOK_SPLITTER_QUOTE_IDS) {
    quoteId = OUTLOOK_SPLITTER_QUOTE_IDS[_];
    if ((splitterElement = findOutlookSplitterWithQuoteId(emailDocument, quoteId))) {
      possibleSplitterElements.push(splitterElement);
    }
  }
  if (!possibleSplitterElements.length) {
    return null;
  }
  return possibleSplitterElements.sort(compareByDomPosition)[0];
};

DOCUMENT_POSITION_PRECEDING = 2;

DOCUMENT_POSITION_FOLLOWING = 4;

compareByDomPosition = function(elementA, elementB) {
  var documentPositionComparison;
  documentPositionComparison = elementA.compareDocumentPosition(elementB);
  if (documentPositionComparison & DOCUMENT_POSITION_PRECEDING) {
    return 1;
  } else if (documentPositionComparison & DOCUMENT_POSITION_FOLLOWING) {
    return -1;
  }
  return 0;
};

findOutlookSplitterWithXpathQuery = function(emailDocument, xpathQuery) {
  var splitterElement, xpathResult;
  xpathResult = emailDocument.evaluate(xpathQuery, emailDocument, null, 9, null);
  splitterElement = xpathResult.singleNodeValue;
  if (splitterElement != null) {
    splitterElement = splitterElement.parentElement.parentElement;
    splitterElement = splitterElement.parentElement.parentElement;
  }
  return splitterElement;
};

findOutlookSplitterWithQuerySelector = function(emailDocument, query) {
  var splitterElement, splitterResult;
  splitterResult = emailDocument.querySelectorAll(query);
  if (!(splitterResult.length > 1)) {
    return;
  }
  splitterElement = splitterResult[1];
  if ((splitterElement.parentElement != null) && splitterElement === splitterElement.parentElement.children[0]) {
    splitterElement = splitterElement.parentElement;
  }
  return splitterElement;
};

findOutlookSplitterWithQuoteId = function(emailDocument, id) {
  var splitterResult;
  splitterResult = emailDocument.querySelectorAll(id);
  if (!splitterResult.length) {
    return;
  }
  return splitterResult[0];
};

removeNodes = function(nodesArray) {
  var i, index, node, ref, ref1, results;
  results = [];
  for (index = i = ref = nodesArray.length - 1; ref <= 0 ? i <= 0 : i >= 0; index = ref <= 0 ? ++i : --i) {
    node = nodesArray[index];
    results.push(node != null ? (ref1 = node.parentNode) != null ? ref1.removeChild(node) : void 0 : void 0);
  }
  return results;
};

ensureTextNodeBetweenChildElements = function(element) {
  var currentNode, dom, newTextNode, results;
  dom = element.ownerDocument;
  currentNode = element.childNodes[0];
  if (!currentNode) {
    newTextNode = dom.createTextNode(' ');
    element.appendChild(newTextNode);
    return;
  }
  results = [];
  while (currentNode.nextSibling) {
    if (currentNode.nodeType === 1 && currentNode.nextSibling.nodeType === 1) {
      newTextNode = dom.createTextNode(' ');
      element.insertBefore(newTextNode, currentNode.nextSibling);
    }
    results.push(currentNode = currentNode.nextSibling);
  }
  return results;
};

hasTagName = function(element, tagName) {
  return element.tagName.toLowerCase() === tagName;
};
