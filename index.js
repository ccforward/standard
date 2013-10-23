/**
 * @fileoverview 
 * @author 晨辰<cc.ccking@gmail.com>
 * @module MDToHtml
 **/
    function MDToHtml(){
    }
    MDToHtml.prototype = {
        parse : function(text){
            text = this._loadText(text);
            return this.parseText(text);
        },

        parseText : function(text){
            text = this._parseHeads(text);
            // 删除开头空格
            text = text.replace(/^[ ]{1,3}(\S)/gm, function(match, nextChar){
                return nextChar;
            });
            text = this._parseRules(text);
            if (text[text.length-1] == '\n'){
                text = text.slice(0, -1);
            }

            text = this._parseLineBreaks(text);
            text = this._parseLists(text);
            text = this._parseCodeBlocks(text);
            text = this._parseCode(text);
            text = this._parseBlockQuotes(text);
            text = this._parseHtmlEscape(text);
            text = this._parseInline(text);
            text = this._parseParagraphs(text);
            text = this._parseLinks(text);
            text = this._parseMarkDownEscape(text);

            return text;
        },

        // 加载输入的文本
        _loadText : function(text){
            var self = this;
            self.references = {};
            //0-3 空格, [name]:, 1-3 空格, url (除了 空格  ",',(, ), 都用<>包裹 )
            // title 在 ", ' 或者 () 之中 , 然后是空格
            var referenceRe = /^(?:[ ]{0,3})\[([^\]]+)\]:[ ]{1,3}<?([^ "'(\n\r]+?)>?(?:\s+["'(]([^"')]+)["')])?\s*$/gm;
            text = text.replace(referenceRe, function(match, name, url, title){
                
                title = title ? title.trim().toLowerCase() : undefined;
                self.references[name] = {
                    'url': url,
                    'title': title
                };
                return '';
            });
            return text;
        },

        // ================================ 字符转义 ================================
        // 转义所有的转义字符
        _escapeText : function(text){
            var escapeableChars = '[\\\\`*_(){}\\[\\]#+-.!]';
            return text.replace(new RegExp('(.?)(' + escapeableChars + ')', 'g'), function(match, firstChar, escapeChar){
                return firstChar + '\\' + escapeChar;
            });
        },

        // 替换md的转义字符串 ( \\ -> \, \* -> *)
        _parseMarkDownEscape : function(text){
            var escapeableChars = '[\\\\`*_(){}\\[\\]#+-.!]';
            return text.replace(new RegExp('\\\\' + escapeableChars, 'g'), function(match){
                return match.slice(1);
            });
        },

        _parseHtmlEscape : function(text, escapeInlineHTML){
            var htmlTagPositions;
            // 除了在html实际字符中  替换 & --> &amp;  
            text = text.replace(/&.{0,7}/g, function(match){
                if (match.match(/^&.{1,6};/)){
                    return match;
                } else {
                    return '&amp;' + match.slice(1);
                }
            });
            if (escapeInlineHTML){
                text = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            } else {
                text = text.replace(/<[\s\S]?/g, function(match, offset){
                    if (match.match(/^<[a-zA-Z\/]/)){
                        return match;
                    } else {
                        return '&lt;' + match.slice(1);
                    }
                });
            }
            return text;
        },

        // ================================ inline元素 ================================

        modifyElements : {
            '**': 'strong',
            '__': 'strong',
            '*': 'em',
            '_': 'em',
        },

        _parseCode : function(text){
            var self = this;
            // 使用 ```code``` ``code`` `code` 或者 \`code\`
            var codeOpening = /(?:^|[^\\])(`+)/g;
            var codeClosing;
            var matchStart = codeOpening.exec(text);
            var matchEnd;
            var tickCount;
            // 只要对应好开头结尾，任意数量的`都可以组成代码段 
            // 首先找到第一个` 然后再找一个对应的闭合的`
            while (matchStart){
                // ` 在开头结尾数量相同
                tickCount = matchStart[1].length;
                codeClosing = new RegExp('`{' + tickCount + '}', 'g');
                codeClosing.lastIndex = codeOpening.lastIndex;
                matchEnd = codeClosing.exec(text);
                if (matchEnd){
                    match = text.slice(codeOpening.lastIndex, codeClosing.lastIndex - tickCount).trim();
                    match = self._escapeText(match);
                    match = self._parseHtmlEscape(match, true);
                    // 空行 就无视之
                    if (!match.match(/\n\s*\n/)){
                        match = this._parseHtmlEscape(match, true);
                        match = '<code>' + match + '</code>';
                        text = text.slice(0, codeOpening.lastIndex - tickCount) + match + text.slice(codeClosing.lastIndex);
                        codeOpening.lastIndex = codeOpening.lastIndex - tickCount + match.length;
                    }
                }
                matchStart = codeOpening.exec(text);
            }
            return text;
        },

        _replaceInline : function(text, character, tag){
            var openingTag = '<%s>'.replace('%s', tag);
            var closingTag = '</%s>'.replace('%s', tag);
            character = character.replace(/./g, function(character){ return '[' + character + ']'; });
            // * 位于开头或者中间但不在反斜线 \ 后面
            var openingCharacter = '(?:^%c)|(?:[^\\\\]%c)'.replace(/%c/g, character);
            // * 不再 \ 或者 空格 后面
            var closingCharacter = '(?:[^\\\\ ])%s'.replace('%s', character);;
            // optional body (char that isn't space + some arbitary chars), then char that isn't space or backslash and character
            // [\s\S] matches any character, including newlines
            var bodyAndClosingChar = '([^ ][\\S\\s]*?)?([^\\\\ ]%c)'.replace('%c', character)
            var charRegexp = new RegExp('(%o)(?:%b)(.{0,1})'.replace('%o', openingCharacter).replace('%b', bodyAndClosingChar), 'g');
            return text.replace(charRegexp, function(match, startChars, middle, endChars, after){
                startChars = startChars.length > 1 ? startChars[0] : '';
                endChars = endChars.length > 1 ? endChars[0] : '';
                middle = middle || '';
                return startChars + openingTag + middle + endChars + closingTag + after;
            });
        },

        _parseInline : function(text){
            var self = this;
            for (var element in self.modifyElements){
                if (self.modifyElements.hasOwnProperty(element)){
                    text = this._replaceInline(text, element, self.modifyElements[element]);
                }
            }
            // console.log(text);
            return text;
        },

        // [文字。。。](http://cc.com/ "title可选")
        _parseLinks : function(text){
            var self = this;
            var inlineLink = /(!?)\[([^\]]+)\]\(([^ "(]+)(?:\s+["]([^"]+)["])?\)/g;
            text = text.replace(inlineLink, function(match, isImage, text, url, title){
                title = title ? ' title="' + title + '"' : '';
                if (isImage){
                    return '<img src="' + url + '" alt="' + text + '"' + title + '></img>'
                } else {
                    return '<a href="' + url + '"' + title + '>' + text + '</a>';
                }
            });

            // [文字。。。][id]
            var referenceLink = /(!?)\[([^\]]+)\][ ]?\[([^\]]*)\]/g;
            text = text.replace(referenceLink, function(match, isImage, text, id){
                var reference;
                var title;
                if (id === ''){
                    id = text;
                }
                reference = self.references[id];
                if (typeof reference === 'undefined'){
                    return match;
                }
                title = reference.title ? ' title="' + reference.title + '"' : '';
                if (isImage){
                    return '<img src="' + reference.url + '" alt="' + text + +'"' + title + '></img>'
                } else {
                    return '<a href="' + reference.url + '"' + title + '>' + text + '</a>';
                }
            });

            // <http://www.ccforward.net>
            var autoLink = /<([a-zA-Z0-9]+:\/\/[^>< ]*)>/g;
            text = text.replace(autoLink, function(match, url){
                return '<a href="' + url + '">' + url + '</a>';
            });
            // <cc.ccking@gmail.com>
            var emailLink = /<([^@ ]+@[^>. ]+\.[^>< ]+)>/g;
            text = text.replace(emailLink, function(match, url){
                return '<a href="mailto:' + url + '">' + url + '</a>';
            });

            return text;
        },


        // ================================ block元素 ================================

        // 换行的末尾有两个空格 --<br/>
        _parseLineBreaks : function(text){
            return text.replace(/[ ]{2}[ ]*\n/g, '<br/>\n');
        },

        // 代码来自 Google
        // 转换 ul li
        _parseLists : function(text){
            // debugger;
            var self = this;
            var handleList = function(listTag, listRe, listElementOpeningRe){
                listElementOpeningRe.lastIndex = 0;
                // 查询所有的list
                return text.replace(listRe, function(fullList){
                    listElementOpeningRe.lastIndex = 0;
                    var result = '';
                    var lastItemContentWasBlock = false;
                    var hasEndingNewLine;
                    var content;
                    var match = listElementOpeningRe.exec(fullList);
                    var currentLiContentStart = listElementOpeningRe.lastIndex;
                    var nextMatch = listElementOpeningRe.exec(fullList);
                    var nextLiStart = nextMatch ? nextMatch.index : fullList.length;
                    // 处理 li
                    while (match){
                        content = fullList.slice(currentLiContentStart, nextLiStart);
                        hasEndingNewLine = content.match(/\n\s*\n$/);
                        content = content.trimRight();
                        // 删除开头的 tab 或者 4个空格
                        content = content.replace(/^(?:\t|(?:\s{1,4}))/gm, '');

                        if (lastItemContentWasBlock || (hasEndingNewLine && nextMatch)){
                            result += '<li>' + self.parseText(content) + '</li>';
                        } else {
                            result += self.parseText('<li>' + content + '</li>');
                        }
                        lastItemContentWasBlock = hasEndingNewLine;
                        match = nextMatch;
                        currentLiContentStart = listElementOpeningRe.lastIndex;
                        nextMatch = listElementOpeningRe.exec(fullList);
                        nextLiStart = nextMatch ? nextMatch.index : fullList.length;
                    }
                    return '<' + listTag + '>' + result + '</' + listTag + '>';
                });
            }

            // ul * 开头
            var unorderedList = /(?:(?:^[\-+*]\s+.*(?:\n|$))(?:^(?:.+)(?:\n|$))*(?:^(\n|$))*)+/gm;
            var unorderedListBegin = /^[\-+*]/gm;
            text = handleList('ul', unorderedList, unorderedListBegin);

            // ol 数字. 开头
            var orderedList =   /(?:(?:^\d+[.]\s+.*(?:\n|$))(?:^(?:.+)(?:\n|$))*(?:^(\n|$))*)+/gm;
            var orderedListBegin = /^\d+[.]/gm;
            text = handleList('ol', orderedList, orderedListBegin);
            return text;
        },

        //  > 开头+文字
        _parseBlockQuotes : function(text){
            var self = this;

            var blockQuote = /(?:(?:^>.*\n?)(?:^.+\n?)*(?:^\s\n?)*)+/gm;
            text = text.replace(blockQuote, function(match){
                // 删除 > 和 无效空格
                match = match.replace(/^>?(?: {0,3}(\S))?/gm, function(match, nextChar){
                    return nextChar || '';
                });
                // 递归替换
                match = self.parseText(match);
                return '<blockquote>' + match + '</blockquote>';
            });
            return text;
        },

        //  4个或多个空格开头 或者tab开头
        _parseCodeBlocks : function(text){
            var self = this;
            
            var codeBlock = /(?:^(?:[ ]{4}|\t).*)(?:\n^(?:(?:(?:[ ]{4}|\t).*)|(?:\s*)))*(?:\n|$)/gm;
            text = text.replace(codeBlock, function(match){
                // 删除开头
                match = match.replace(/^(?:\t|[ ]{4})/gm, '');
                match = self._escapeText(match);
                match = self._parseHtmlEscape(match, true);
                return '<pre><code>' + match + '</code></pre>';
            });
            return text;
        },

        _parseHeads : function(text){
            /*
                h1
                ----
            */
            var setextH1 = /^(.*)\n[=]+$/gm;
            text = text.replace(setextH1, function(match, content){
                return '<h1>' + content.trim() + '</h1>';
            });
             /*
                h2
                =====
            */
            var setextH2 = /^(.*)\n[-]+$/gm;
            text = text.replace(setextH2, function(match, content){
                return '<h2>' + content.trim() + '</h2>';
            });

            // 以#的数量计算  1-6
            var atxHeading = /^(#+)(.*?)#*$/gm;
            text = text.replace(atxHeading, function(match, opening, content){
                var tag = 'h' + (Math.min(opening.length, 6)).toString();
                return '<' + tag + '>' + content.trim() + '</' + tag + '>';
            });

            return text;
        },

        // --------, _________  ****** 转 <hr/>
        _parseRules : function(text){
            var rules = [
                /^[-][- ]+$/gm,
                /^[_][_ ]+$/gm,
                /^[*][* ]+$/gm
            ];
            var doRuleReplacement = function(match){
                match = match.replace(' ', '');
                if (match.length >= 3){
                    return '<hr/>';
                } else {
                    return match;
                }
            };
            for (var i = 0; i < rules.length; i++){
                (function(rule){
                    text = text.replace(rule, doRuleReplacement);
                })(rules[i]);
            }
            return text;
        },


        // 代码源自google  略有问题。。。。。
        // 段落转换  块级元素
        _parseParagraphs : function(text){
            var blockElements = [
                '^<blockquote(?: .*?)?>',
                '^<div(?: .*?)?>',
                '^<dl(?: .*?)?>',
                '^<fieldset(?: .*?)?>',
                '^<form(?: .*?)?>',
                '^<h1(?: .*?)?>',
                '^<h2(?: .*?)?>',
                '^<h3(?: .*?)?>',
                '^<h4(?: .*?)?>',
                '^<h5(?: .*?)?>',
                '^<h6(?: .*?)?>',
                '^<hr(?: .*?)?>',
                '^<li(?: .*?)?>',
                '^<ol(?: .*?)?>',
                '^<p(?: .*?)?>',
                '^<pre(?: .*?)?>',
                '^<table(?: .*?)?>',
                '^<ul(?: .*?)?>'
            ];
            // 用 p标签  包裹
            // 块级元素都要展开, 而且要在行间元素之前
            // 所有的html都要转义

            var emptyLine = '(?:^\\s*(?:\\n|$))';
            var blockLevelElement = blockElements.join('|');
            var paragraphEnd = new RegExp(emptyLine + '|(' + blockLevelElement + ')', 'gm');
            var lineStart = /^/gm;

            var lastParagraphEnd = 0;
            var match;
            var matchLength;
            var matchCause;
            var nextParagraphEnd;
            var paragraphText;
            var end;
            while (lastParagraphEnd < text.length){
                match = paragraphEnd.exec(text);
                if (match){
                    nextParagraphEnd = match.index;
                    matchLength = match[0].length;
                    if (match[1]){
                        matchCause = match[1].slice(1, match[1].indexOf(' '));
                    } else {
                        matchCause = ''
                    }
                } else {
                    nextParagraphEnd = text.length;
                    matchLength = 0;
                    matchCause = '';
                }
                /// 拉出所有的东西 用 <p> 包裹
                if (nextParagraphEnd !== lastParagraphEnd){
                    paragraphText = text.slice(lastParagraphEnd, nextParagraphEnd).trimLeft();
                    if (paragraphText){
                        if (paragraphText[paragraphText.length - 1] === '\n'){
                            paragraphText = paragraphText.slice(0, -1);
                            nextParagraphEnd -= 1;
                        }
                        paragraphText = '<p>' + paragraphText + '</p>';
                        text = text.slice(0, lastParagraphEnd) + paragraphText + text.slice(nextParagraphEnd);
                        nextParagraphEnd = lastParagraphEnd + paragraphText.length + matchLength;
                    }
                }
                //到下一段落的开头
                if (matchCause === ''){
                    // 空行  直接下一行
                    paragraphStart = /^/m;
                    nextParagraphEnd += 1;
                } else if (matchCause){
                    // 块级元素闭合后再到下一行
                    paragraphStart = new RegExp('</' + matchCause + '>', 'g');
                }
                paragraphStart.lastIndex = nextParagraphEnd;
                if (paragraphStart.exec(text) !== null){
                    paragraphEnd.lastIndex = paragraphStart.lastIndex;
                    lastParagraphEnd = paragraphEnd.lastIndex;
                } else {
                    break;
                }
            }
            return text;
        }

    }
    window.MDToHtml =  MDToHtml;