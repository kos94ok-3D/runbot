(function (exports) {
    'use strict';

    /**
     * Block DOM
     *
     * A virtual-dom inspired implementation, but where the basic primitive is a
     * "block" instead of just a html (v)node.
     */
    // -----------------------------------------------------------------------------
    //  Block
    // -----------------------------------------------------------------------------
    class Block {
        constructor() {
            this.el = null;
        }
        mount(parent) {
            const anchor = document.createTextNode("");
            parent.appendChild(anchor);
            this.mountBefore(anchor);
            anchor.remove();
        }
        remove() { }
        move(parent) {
            const anchor = document.createTextNode("");
            parent.appendChild(anchor);
            this.moveBefore(anchor);
            anchor.remove();
        }
        moveBefore(anchor) {
            this.mountBefore(anchor);
        }
    }
    // -----------------------------------------------------------------------------
    //  Html Block
    // -----------------------------------------------------------------------------
    class BHtml extends Block {
        constructor(html) {
            super();
            this.content = [];
            this.html = String(html);
            this.anchor = document.createTextNode("");
        }
        firstChildNode() {
            return this.content[0];
        }
        mountBefore(anchor) {
            this.build();
            anchor.before(this.anchor);
            for (let elem of this.content) {
                this.anchor.before(elem);
            }
        }
        moveBefore(anchor) {
            anchor.before(this.anchor);
            for (let elem of this.content) {
                this.anchor.before(elem);
            }
        }
        build() {
            const div = document.createElement("div");
            div.innerHTML = this.html;
            this.content = [...div.childNodes];
            this.el = this.content[0];
        }
        remove() {
            for (let elem of this.content) {
                elem.remove();
            }
            this.anchor.remove();
        }
        patch(other) {
            for (let elem of this.content) {
                elem.remove();
            }
            this.build();
            for (let elem of this.content) {
                this.anchor.before(elem);
            }
        }
        toString() {
            return this.html;
        }
    }
    // -----------------------------------------------------------------------------
    //  Text Block
    // -----------------------------------------------------------------------------
    class BText extends Block {
        constructor(text) {
            super();
            this.el = document.createTextNode(text);
            this.text = text;
        }
        firstChildNode() {
            return this.el;
        }
        mountBefore(anchor) {
            anchor.before(this.el);
        }
        patch(other) {
            if (other.text !== this.text) {
                this.el.textContent = other.el.textContent;
                this.text = other.text;
            }
        }
        toString() {
            return this.el.textContent;
        }
    }
    // -----------------------------------------------------------------------------
    //  Content Block
    // -----------------------------------------------------------------------------
    class BNode extends Block {
        constructor() {
            super(...arguments);
            // el?: HTMLElement | Text;
            this.children = null;
            this.anchors = null;
            this.data = null;
            this.handlers = null;
        }
        firstChildNode() {
            return this.el;
        }
        toString() {
            const div = document.createElement("div");
            this.mount(div);
            return div.innerHTML;
        }
        mountBefore(anchor) {
            this.el = this.constructor.el.cloneNode(true);
            this.build();
            this.update();
            if (this.children) {
                for (let i = 0; i < this.children.length; i++) {
                    const child = this.children[i];
                    if (child) {
                        const anchor = this.anchors[i];
                        child.mountBefore(anchor);
                    }
                }
            }
            anchor.before(this.el);
        }
        moveBefore(anchor) {
            anchor.before(this.el);
        }
        update() { }
        updateClass(elem, _class) {
            switch (typeof _class) {
                case "object":
                    for (let k in _class) {
                        if (_class[k]) {
                            elem.classList.add(k);
                        }
                    }
                    break;
                case "string":
                    if (_class) {
                        for (let cl of _class.trim().split(" ")) {
                            elem.classList.add(cl);
                        }
                    }
                    break;
                default:
                    elem.classList.add(_class);
            }
        }
        updateAttr(elem, attr, value) {
            if (value !== false) {
                if (value === true) {
                    elem.setAttribute(attr, "");
                }
                else {
                    elem.setAttribute(attr, value);
                }
            }
        }
        updateAttrs(elem, attrs) {
            if (Array.isArray(attrs)) {
                elem.setAttribute(attrs[0], attrs[1]);
            }
            else {
                for (let key in attrs) {
                    elem.setAttribute(key, attrs[key]);
                }
            }
        }
        updateProp(elem, prop, value) {
            elem[prop] = value;
        }
        setupHandler(el, index) {
            const eventType = this.handlers[index][0];
            el.addEventListener(eventType, () => {
                const info = this.handlers[index];
                const [, callback, ctx] = info;
                if (ctx.__owl__ && !ctx.__owl__.isMounted) {
                    return;
                }
                callback();
            });
        }
        build() { }
        patch(newTree) {
            this.data = newTree.data;
            this.refs = newTree.refs;
            this.update();
            if (this.children) {
                const anchors = this.anchors;
                const children = this.children;
                const newChildren = newTree.children;
                for (let i = 0, l = newChildren.length; i < l; i++) {
                    const newChild = newChildren[i];
                    const child = children[i];
                    if (child) {
                        if (newChild) {
                            child.patch(newChild);
                        }
                        else {
                            children[i] = null;
                            child.remove();
                        }
                    }
                    else if (newChild) {
                        children[i] = newChild;
                        newChild.mountBefore(anchors[i]);
                    }
                }
            }
        }
        remove() {
            this.el.remove();
        }
    }
    class BStatic extends Block {
        firstChildNode() {
            return this.el;
        }
        toString() {
            const div = document.createElement("div");
            this.mount(div);
            return div.innerHTML;
        }
        mountBefore(anchor) {
            this.el = this.constructor.el.cloneNode(true);
            anchor.before(this.el);
        }
        moveBefore(anchor) {
            anchor.before(this.el);
        }
        update() { }
        patch() { }
        remove() {
            this.el.remove();
        }
    }
    // -----------------------------------------------------------------------------
    //  Multi Block
    // -----------------------------------------------------------------------------
    class BMulti extends Block {
        constructor(n) {
            super();
            this.children = new Array(n);
            this.anchors = new Array(n);
        }
        firstChildNode() {
            for (let child of this.children) {
                if (child) {
                    return child.firstChildNode();
                }
            }
            return null;
        }
        mountBefore(anchor) {
            const children = this.children;
            const anchors = this.anchors;
            for (let i = 0, l = children.length; i < l; i++) {
                let child = children[i];
                const childAnchor = document.createTextNode("");
                anchor.before(childAnchor);
                anchors[i] = childAnchor;
                if (child) {
                    child.mountBefore(childAnchor);
                }
            }
        }
        moveBefore(anchor) {
            for (let i = 0; i < this.children.length; i++) {
                let child = this.children[i];
                const childAnchor = document.createTextNode("");
                anchor.before(childAnchor);
                this.anchors[i] = childAnchor;
                if (child) {
                    child.moveBefore(childAnchor);
                }
            }
        }
        patch(newTree) {
            const children = this.children;
            const newChildren = newTree.children;
            const anchors = this.anchors;
            for (let i = 0, l = children.length; i < l; i++) {
                const block = children[i];
                const newBlock = newChildren[i];
                if (block) {
                    if (newBlock) {
                        block.patch(newBlock);
                    }
                    else {
                        children[0] = null;
                        block.remove();
                    }
                }
                else if (newBlock) {
                    children[i] = newBlock;
                    newBlock.mountBefore(anchors[i]);
                }
            }
        }
        remove() {
            for (let i = 0; i < this.children.length; i++) {
                this.children[i].remove();
                this.anchors[i].remove();
            }
        }
        toString() {
            return this.children.map((c) => (c ? c.toString() : "")).join("");
        }
    }
    // -----------------------------------------------------------------------------
    //  Collection Block
    // -----------------------------------------------------------------------------
    class BCollection extends Block {
        constructor(n) {
            super();
            this.keys = new Array(n);
            this.children = new Array(n);
        }
        firstChildNode() {
            return this.children.length ? this.children[0].firstChildNode() : null;
        }
        mountBefore(anchor) {
            const _anchor = document.createTextNode("");
            anchor.before(_anchor);
            this.anchor = _anchor;
            for (let child of this.children) {
                if (child) {
                    child.mountBefore(_anchor);
                }
            }
        }
        moveBefore(anchor) {
            const _anchor = document.createTextNode("");
            anchor.before(_anchor);
            this.anchor = _anchor;
            for (let child of this.children) {
                if (child) {
                    child.moveBefore(_anchor);
                }
            }
        }
        patch(other) {
            const oldKeys = this.keys;
            const newKeys = other.keys;
            const oldCh = this.children;
            const newCh = other.children;
            let oldStartIdx = 0;
            let newStartIdx = 0;
            let oldEndIdx = oldCh.length - 1;
            let newEndIdx = newCh.length - 1;
            let mapping = undefined;
            const _anchor = this.anchor;
            while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
                if (!oldCh[oldStartIdx]) {
                    oldStartIdx++;
                }
                else if (!oldCh[oldEndIdx]) {
                    oldEndIdx--;
                }
                else if (oldKeys[oldStartIdx] === newKeys[newStartIdx]) {
                    oldCh[oldStartIdx].patch(newCh[newStartIdx]);
                    newCh[newStartIdx] = oldCh[oldStartIdx];
                    oldStartIdx++;
                    newStartIdx++;
                }
                else if (oldKeys[oldEndIdx] === newKeys[newEndIdx]) {
                    oldCh[oldEndIdx].patch(newCh[newEndIdx]);
                    newCh[newEndIdx] = oldCh[oldEndIdx];
                    oldEndIdx--;
                    newEndIdx--;
                }
                else if (oldKeys[oldStartIdx] === newKeys[newEndIdx]) {
                    // bnode moved right
                    const elm = oldCh[oldStartIdx];
                    elm.patch(newCh[newEndIdx]);
                    const nextChild = newCh[newEndIdx + 1];
                    const anchor = nextChild ? nextChild.firstChildNode() : _anchor;
                    elm.moveBefore(anchor);
                    newCh[newEndIdx] = elm;
                    oldStartIdx++;
                    newEndIdx--;
                }
                else if (oldKeys[oldEndIdx] === newKeys[newStartIdx]) {
                    // bnode moved left
                    const elm = oldCh[oldEndIdx];
                    elm.patch(newCh[newStartIdx]);
                    const nextChild = oldCh[oldStartIdx];
                    const anchor = nextChild ? nextChild.firstChildNode() : _anchor;
                    elm.moveBefore(anchor);
                    newCh[newStartIdx] = elm;
                    oldEndIdx--;
                    newStartIdx++;
                }
                else {
                    mapping = mapping || createMapping(oldKeys, oldStartIdx, oldEndIdx);
                    let idxInOld = mapping[newKeys[newStartIdx]];
                    if (idxInOld === undefined) {
                        // new element
                        newCh[newStartIdx].mountBefore(oldCh[oldStartIdx].firstChildNode());
                        newStartIdx++;
                    }
                    else {
                        const elmToMove = oldCh[idxInOld];
                        elmToMove.moveBefore(oldCh[oldStartIdx].firstChildNode());
                        elmToMove.patch(newCh[newStartIdx]);
                        newCh[newStartIdx] = elmToMove;
                        oldCh[idxInOld] = null;
                        newStartIdx++;
                    }
                }
            }
            if (oldStartIdx <= oldEndIdx || newStartIdx <= newEndIdx) {
                if (oldStartIdx > oldEndIdx) {
                    const nextChild = newCh[newEndIdx + 1];
                    const anchor = nextChild ? nextChild.firstChildNode() : _anchor;
                    for (let i = newStartIdx; i <= newEndIdx; i++) {
                        newCh[i].mountBefore(anchor);
                    }
                }
                else {
                    for (let i = oldStartIdx; i <= oldEndIdx; i++) {
                        let ch = oldCh[i];
                        if (ch) {
                            ch.remove();
                        }
                    }
                }
            }
            this.children = newCh;
            this.keys = newKeys;
        }
    }
    function createMapping(oldKeys, oldStartIdx, oldEndIdx) {
        let mapping = {};
        for (let i = oldStartIdx; i <= oldEndIdx; i++) {
            mapping[oldKeys[i]] = i;
        }
        return mapping;
    }
    const Blocks = {
        BNode,
        BStatic,
        BMulti,
        BHtml,
        BCollection,
        BText,
    };

    /**
     * Owl QWeb Expression Parser
     *
     * Owl needs in various contexts to be able to understand the structure of a
     * string representing a javascript expression.  The usual goal is to be able
     * to rewrite some variables.  For example, if a template has
     *
     *  ```xml
     *  <t t-if="computeSomething({val: state.val})">...</t>
     * ```
     *
     * this needs to be translated in something like this:
     *
     * ```js
     *   if (context["computeSomething"]({val: context["state"].val})) { ... }
     * ```
     *
     * This file contains the implementation of an extremely naive tokenizer/parser
     * and evaluator for javascript expressions.  The supported grammar is basically
     * only expressive enough to understand the shape of objects, of arrays, and
     * various operators.
     */
    //------------------------------------------------------------------------------
    // Misc types, constants and helpers
    //------------------------------------------------------------------------------
    const RESERVED_WORDS = "true,false,NaN,null,undefined,debugger,console,window,in,instanceof,new,function,return,this,eval,void,Math,RegExp,Array,Object,Date".split(",");
    const WORD_REPLACEMENT = {
        and: "&&",
        or: "||",
        gt: ">",
        gte: ">=",
        lt: "<",
        lte: "<=",
    };
    const STATIC_TOKEN_MAP = {
        "{": "LEFT_BRACE",
        "}": "RIGHT_BRACE",
        "[": "LEFT_BRACKET",
        "]": "RIGHT_BRACKET",
        ":": "COLON",
        ",": "COMMA",
        "(": "LEFT_PAREN",
        ")": "RIGHT_PAREN",
    };
    // note that the space after typeof is relevant. It makes sure that the formatted
    // expression has a space after typeof
    const OPERATORS = "...,.,===,==,+,!==,!=,!,||,&&,>=,>,<=,<,?,-,*,/,%,typeof ,=>,=,;,in ".split(",");
    let tokenizeString = function (expr) {
        let s = expr[0];
        let start = s;
        if (s !== "'" && s !== '"') {
            return false;
        }
        let i = 1;
        let cur;
        while (expr[i] && expr[i] !== start) {
            cur = expr[i];
            s += cur;
            if (cur === "\\") {
                i++;
                cur = expr[i];
                if (!cur) {
                    throw new Error("Invalid expression");
                }
                s += cur;
            }
            i++;
        }
        if (expr[i] !== start) {
            throw new Error("Invalid expression");
        }
        s += start;
        return { type: "VALUE", value: s };
    };
    let tokenizeNumber = function (expr) {
        let s = expr[0];
        if (s && s.match(/[0-9]/)) {
            let i = 1;
            while (expr[i] && expr[i].match(/[0-9]|\./)) {
                s += expr[i];
                i++;
            }
            return { type: "VALUE", value: s };
        }
        else {
            return false;
        }
    };
    let tokenizeSymbol = function (expr) {
        let s = expr[0];
        if (s && s.match(/[a-zA-Z_\$]/)) {
            let i = 1;
            while (expr[i] && expr[i].match(/\w/)) {
                s += expr[i];
                i++;
            }
            if (s in WORD_REPLACEMENT) {
                return { type: "OPERATOR", value: WORD_REPLACEMENT[s], size: s.length };
            }
            return { type: "SYMBOL", value: s };
        }
        else {
            return false;
        }
    };
    const tokenizeStatic = function (expr) {
        const char = expr[0];
        if (char && char in STATIC_TOKEN_MAP) {
            return { type: STATIC_TOKEN_MAP[char], value: char };
        }
        return false;
    };
    const tokenizeOperator = function (expr) {
        for (let op of OPERATORS) {
            if (expr.startsWith(op)) {
                return { type: "OPERATOR", value: op };
            }
        }
        return false;
    };
    const TOKENIZERS = [
        tokenizeString,
        tokenizeNumber,
        tokenizeOperator,
        tokenizeSymbol,
        tokenizeStatic,
    ];
    /**
     * Convert a javascript expression (as a string) into a list of tokens. For
     * example: `tokenize("1 + b")` will return:
     * ```js
     *  [
     *   {type: "VALUE", value: "1"},
     *   {type: "OPERATOR", value: "+"},
     *   {type: "SYMBOL", value: "b"}
     * ]
     * ```
     */
    function tokenize(expr) {
        const result = [];
        let token = true;
        while (token) {
            expr = expr.trim();
            if (expr) {
                for (let tokenizer of TOKENIZERS) {
                    token = tokenizer(expr);
                    if (token) {
                        result.push(token);
                        expr = expr.slice(token.size || token.value.length);
                        break;
                    }
                }
            }
            else {
                token = false;
            }
        }
        if (expr.length) {
            throw new Error(`Tokenizer error: could not tokenize "${expr}"`);
        }
        return result;
    }
    //------------------------------------------------------------------------------
    // Expression "evaluator"
    //------------------------------------------------------------------------------
    /**
     * This is the main function exported by this file. This is the code that will
     * process an expression (given as a string) and returns another expression with
     * proper lookups in the context.
     *
     * Usually, this kind of code would be very simple to do if we had an AST (so,
     * if we had a javascript parser), since then, we would only need to find the
     * variables and replace them.  However, a parser is more complicated, and there
     * are no standard builtin parser API.
     *
     * Since this method is applied to simple javasript expressions, and the work to
     * be done is actually quite simple, we actually can get away with not using a
     * parser, which helps with the code size.
     *
     * Here is the heuristic used by this method to determine if a token is a
     * variable:
     * - by default, all symbols are considered a variable
     * - unless the previous token is a dot (in that case, this is a property: `a.b`)
     * - or if the previous token is a left brace or a comma, and the next token is
     *   a colon (in that case, this is an object key: `{a: b}`)
     *
     * Some specific code is also required to support arrow functions. If we detect
     * the arrow operator, then we add the current (or some previous tokens) token to
     * the list of variables so it does not get replaced by a lookup in the context
     */
    function compileExprToArray(expr) {
        const localVars = new Set();
        const tokens = tokenize(expr);
        for (let i = 0; i < tokens.length; i++) {
            let token = tokens[i];
            let prevToken = tokens[i - 1];
            let nextToken = tokens[i + 1];
            let isVar = token.type === "SYMBOL" && !RESERVED_WORDS.includes(token.value);
            if (token.type === "SYMBOL" && !RESERVED_WORDS.includes(token.value)) {
                if (prevToken) {
                    if (prevToken.type === "OPERATOR" && prevToken.value === ".") {
                        isVar = false;
                    }
                    else if (prevToken.type === "LEFT_BRACE" || prevToken.type === "COMMA") {
                        if (nextToken && nextToken.type === "COLON") {
                            isVar = false;
                        }
                    }
                }
            }
            if (nextToken && nextToken.type === "OPERATOR" && nextToken.value === "=>") {
                if (token.type === "RIGHT_PAREN") {
                    let j = i - 1;
                    while (j > 0 && tokens[j].type !== "LEFT_PAREN") {
                        if (tokens[j].type === "SYMBOL" && tokens[j].originalValue) {
                            tokens[j].value = tokens[j].originalValue;
                            localVars.add(tokens[j].value);
                        }
                        j--;
                    }
                }
                else {
                    localVars.add(token.value);
                }
            }
            if (isVar) {
                token.varName = token.value;
                if (!localVars.has(token.value)) {
                    token.originalValue = token.value;
                    token.value = `ctx['${token.value}']`;
                }
            }
        }
        return tokens;
    }
    function compileExpr(expr) {
        return compileExprToArray(expr)
            .map((t) => t.value)
            .join("");
    }
    const INTERP_REGEXP = /\{\{.*?\}\}/g;
    const INTERP_GROUP_REGEXP = /\{\{.*?\}\}/g;
    function interpolate(s) {
        let matches = s.match(INTERP_REGEXP);
        if (matches && matches[0].length === s.length) {
            return `(${compileExpr(s.slice(2, -2))})`;
        }
        let r = s.replace(INTERP_GROUP_REGEXP, (s) => "${" + compileExpr(s.slice(2, -2)) + "}");
        return "`" + r + "`";
    }

    // -----------------------------------------------------------------------------
    // AST Type definition
    // -----------------------------------------------------------------------------
    var ASTType;
    (function (ASTType) {
        ASTType[ASTType["Text"] = 0] = "Text";
        ASTType[ASTType["Comment"] = 1] = "Comment";
        ASTType[ASTType["DomNode"] = 2] = "DomNode";
        ASTType[ASTType["Multi"] = 3] = "Multi";
        ASTType[ASTType["TEsc"] = 4] = "TEsc";
        ASTType[ASTType["TIf"] = 5] = "TIf";
        ASTType[ASTType["TSet"] = 6] = "TSet";
        ASTType[ASTType["TCall"] = 7] = "TCall";
        ASTType[ASTType["TRaw"] = 8] = "TRaw";
        ASTType[ASTType["TForEach"] = 9] = "TForEach";
        ASTType[ASTType["TKey"] = 10] = "TKey";
        ASTType[ASTType["TComponent"] = 11] = "TComponent";
        ASTType[ASTType["TDebug"] = 12] = "TDebug";
        ASTType[ASTType["TLog"] = 13] = "TLog";
        ASTType[ASTType["TSlot"] = 14] = "TSlot";
    })(ASTType || (ASTType = {}));
    function parse(xml) {
        const template = `<t>${xml}</t>`;
        const doc = parseXML(template);
        const ctx = { inPreTag: false };
        const ast = parseNode(doc.firstChild, ctx);
        if (!ast) {
            return { type: 0 /* Text */, value: "" };
        }
        return ast;
    }
    function parseNode(node, ctx) {
        if (!(node instanceof Element)) {
            return parseTextCommentNode(node, ctx);
        }
        return (parseTDebugLog(node, ctx) ||
            parseTForEach(node, ctx) ||
            parseTIf(node, ctx) ||
            parseTCall(node, ctx) ||
            parseTEscNode(node, ctx) ||
            parseTKey(node, ctx) ||
            parseTSlot(node, ctx) ||
            parseTRawNode(node, ctx) ||
            parseComponent(node, ctx) ||
            parseDOMNode(node, ctx) ||
            parseTSetNode(node, ctx) ||
            parseTNode(node, ctx));
    }
    // -----------------------------------------------------------------------------
    // <t /> tag
    // -----------------------------------------------------------------------------
    function parseTNode(node, ctx) {
        if (node.tagName !== "t") {
            return null;
        }
        const children = [];
        for (let child of node.childNodes) {
            const ast = parseNode(child, ctx);
            if (ast) {
                children.push(ast);
            }
        }
        switch (children.length) {
            case 0:
                return null;
            case 1:
                return children[0];
            default:
                return {
                    type: 3 /* Multi */,
                    content: children,
                };
        }
    }
    // -----------------------------------------------------------------------------
    // Text and Comment Nodes
    // -----------------------------------------------------------------------------
    const lineBreakRE = /[\r\n]/;
    const whitespaceRE = /\s+/g;
    function parseTextCommentNode(node, ctx) {
        if (node.nodeType === 3) {
            let value = node.textContent || "";
            if (!ctx.inPreTag) {
                if (lineBreakRE.test(value) && !value.trim()) {
                    return null;
                }
                value = value.replace(whitespaceRE, " ");
            }
            return { type: 0 /* Text */, value };
        }
        else if (node.nodeType === 8) {
            return { type: 1 /* Comment */, value: node.textContent || "" };
        }
        return null;
    }
    // -----------------------------------------------------------------------------
    // debugging
    // -----------------------------------------------------------------------------
    function parseTDebugLog(node, ctx) {
        if (node.hasAttribute("t-debug")) {
            node.removeAttribute("t-debug");
            return {
                type: 12 /* TDebug */,
                content: parseNode(node, ctx),
            };
        }
        if (node.hasAttribute("t-log")) {
            const expr = node.getAttribute("t-log");
            node.removeAttribute("t-log");
            return {
                type: 13 /* TLog */,
                expr,
                content: parseNode(node, ctx),
            };
        }
        return null;
    }
    // -----------------------------------------------------------------------------
    // Regular dom node
    // -----------------------------------------------------------------------------
    function parseDOMNode(node, ctx) {
        if (node.tagName === "t") {
            return null;
        }
        const children = [];
        if (node.tagName === "pre") {
            ctx = { inPreTag: true };
        }
        let ref = null;
        if (node.hasAttribute("t-ref")) {
            ref = node.getAttribute("t-ref");
            node.removeAttribute("t-ref");
        }
        for (let child of node.childNodes) {
            const ast = parseNode(child, ctx);
            if (ast) {
                children.push(ast);
            }
        }
        const attrs = {};
        const on = {};
        for (let attr of node.getAttributeNames()) {
            const value = node.getAttribute(attr);
            if (attr.startsWith("t-on")) {
                if (attr === "t-on") {
                    throw new Error("Missing event name with t-on directive");
                }
                on[attr.slice(5)] = value;
            }
            else {
                if (attr.startsWith("t-") && !attr.startsWith("t-att")) {
                    throw new Error(`Unknown QWeb directive: '${attr}'`);
                }
                attrs[attr] = value;
            }
        }
        return {
            type: 2 /* DomNode */,
            tag: node.tagName,
            attrs,
            on,
            ref,
            content: children,
        };
    }
    // -----------------------------------------------------------------------------
    // t-esc
    // -----------------------------------------------------------------------------
    function parseTEscNode(node, ctx) {
        if (!node.hasAttribute("t-esc")) {
            return null;
        }
        const escValue = node.getAttribute("t-esc");
        node.removeAttribute("t-esc");
        const tesc = {
            type: 4 /* TEsc */,
            expr: escValue,
            defaultValue: node.textContent || "",
        };
        let ref = node.getAttribute("t-ref");
        node.removeAttribute("t-ref");
        const ast = parseNode(node, ctx);
        if (!ast) {
            return tesc;
        }
        if (ast && ast.type === 2 /* DomNode */) {
            return {
                type: 2 /* DomNode */,
                tag: ast.tag,
                attrs: ast.attrs,
                on: ast.on,
                ref,
                content: [tesc],
            };
        }
        return tesc;
    }
    // -----------------------------------------------------------------------------
    // t-raw
    // -----------------------------------------------------------------------------
    function parseTRawNode(node, ctx) {
        if (!node.hasAttribute("t-raw")) {
            return null;
        }
        const expr = node.getAttribute("t-raw");
        node.removeAttribute("t-raw");
        const tRaw = { type: 8 /* TRaw */, expr, body: null };
        const ref = node.getAttribute("t-ref");
        node.removeAttribute("t-ref");
        const ast = parseNode(node, ctx);
        if (!ast) {
            return tRaw;
        }
        if (ast && ast.type === 2 /* DomNode */) {
            tRaw.body = ast.content.length ? ast.content : null;
            return {
                type: 2 /* DomNode */,
                tag: ast.tag,
                attrs: ast.attrs,
                on: ast.on,
                ref,
                content: [tRaw],
            };
        }
        return tRaw;
    }
    // -----------------------------------------------------------------------------
    // t-foreach and t-key
    // -----------------------------------------------------------------------------
    function parseTForEach(node, ctx) {
        if (!node.hasAttribute("t-foreach")) {
            return null;
        }
        const collection = node.getAttribute("t-foreach");
        node.removeAttribute("t-foreach");
        const elem = node.getAttribute("t-as") || "";
        node.removeAttribute("t-as");
        const key = node.getAttribute("t-key");
        node.removeAttribute("t-key");
        const body = parseNode(node, ctx);
        if (!body) {
            return null;
        }
        return {
            type: 9 /* TForEach */,
            collection,
            elem,
            body,
            key,
        };
    }
    function parseTKey(node, ctx) {
        if (!node.hasAttribute("t-key")) {
            return null;
        }
        const key = node.getAttribute("t-key");
        node.removeAttribute("t-key");
        const body = parseNode(node, ctx);
        if (!body) {
            return null;
        }
        return { type: 10 /* TKey */, expr: key, content: body };
    }
    // -----------------------------------------------------------------------------
    // t-call
    // -----------------------------------------------------------------------------
    function parseTCall(node, ctx) {
        if (!node.hasAttribute("t-call")) {
            return null;
        }
        const subTemplate = node.getAttribute("t-call");
        node.removeAttribute("t-call");
        if (node.tagName !== "t") {
            const ast = parseNode(node, ctx);
            if (ast && ast.type === 2 /* DomNode */) {
                ast.content = [{ type: 7 /* TCall */, name: subTemplate, body: null }];
                return ast;
            }
        }
        const body = [];
        for (let child of node.childNodes) {
            const ast = parseNode(child, ctx);
            if (ast) {
                body.push(ast);
            }
        }
        return {
            type: 7 /* TCall */,
            name: subTemplate,
            body: body.length ? body : null,
        };
    }
    // -----------------------------------------------------------------------------
    // t-if
    // -----------------------------------------------------------------------------
    function parseTIf(node, ctx) {
        if (!node.hasAttribute("t-if")) {
            return null;
        }
        const condition = node.getAttribute("t-if");
        node.removeAttribute("t-if");
        const content = parseNode(node, ctx);
        if (!content) {
            throw new Error("hmmm");
        }
        let nextElement = node.nextElementSibling;
        // t-elifs
        const tElifs = [];
        while (nextElement && nextElement.hasAttribute("t-elif")) {
            const condition = nextElement.getAttribute("t-elif");
            nextElement.removeAttribute("t-elif");
            const tElif = parseNode(nextElement, ctx);
            const next = nextElement.nextElementSibling;
            nextElement.remove();
            nextElement = next;
            if (tElif) {
                tElifs.push({ condition, content: tElif });
            }
        }
        // t-else
        let tElse = null;
        if (nextElement && nextElement.hasAttribute("t-else")) {
            nextElement.removeAttribute("t-else");
            tElse = parseNode(nextElement, ctx);
            nextElement.remove();
        }
        return {
            type: 5 /* TIf */,
            condition,
            content,
            tElif: tElifs.length ? tElifs : null,
            tElse,
        };
    }
    // -----------------------------------------------------------------------------
    // t-set directive
    // -----------------------------------------------------------------------------
    function parseTSetNode(node, ctx) {
        if (!node.hasAttribute("t-set")) {
            return null;
        }
        const name = node.getAttribute("t-set");
        const value = node.getAttribute("t-value") || null;
        const defaultValue = node.innerHTML === node.textContent ? node.textContent || null : null;
        let body = null;
        if (node.textContent !== node.innerHTML) {
            body = [];
            for (let child of node.childNodes) {
                let childAst = parseNode(child, ctx);
                if (childAst) {
                    body.push(childAst);
                }
            }
        }
        return { type: 6 /* TSet */, name, value, defaultValue, body };
    }
    // -----------------------------------------------------------------------------
    // Components
    // -----------------------------------------------------------------------------
    function parseComponent(node, ctx) {
        const firstLetter = node.tagName[0];
        if (firstLetter !== firstLetter.toUpperCase()) {
            return null;
        }
        const props = {};
        const handlers = {};
        for (let name of node.getAttributeNames()) {
            const value = node.getAttribute(name);
            if (name.startsWith("t-on-")) {
                handlers[name.slice(5)] = value;
            }
            else {
                props[name] = value;
            }
        }
        const slots = {};
        if (node.hasChildNodes()) {
            const clone = node.cloneNode(true);
            // named slots
            const slotNodes = Array.from(clone.querySelectorAll("[t-set-slot]"));
            for (let slotNode of slotNodes) {
                const name = slotNode.getAttribute("t-set-slot");
                slotNode.removeAttribute("t-set-slot");
                slotNode.remove();
                const slotAst = parseNode(slotNode, ctx);
                if (slotAst) {
                    slots[name] = slotAst;
                }
            }
            // default slot
            const defaultContent = parseChildNodes(clone, ctx);
            if (defaultContent) {
                slots.default = defaultContent;
            }
        }
        return { type: 11 /* TComponent */, name: node.tagName, props, handlers, slots };
    }
    // -----------------------------------------------------------------------------
    // Slots
    // -----------------------------------------------------------------------------
    function parseTSlot(node, ctx) {
        if (!node.hasAttribute("t-slot")) {
            return null;
        }
        return {
            type: 14 /* TSlot */,
            name: node.getAttribute("t-slot"),
            defaultContent: parseChildNodes(node, ctx),
        };
    }
    // -----------------------------------------------------------------------------
    // helpers
    // -----------------------------------------------------------------------------
    function parseChildNodes(node, ctx) {
        const children = [];
        for (let child of node.childNodes) {
            const childAst = parseNode(child, ctx);
            if (childAst) {
                children.push(childAst);
            }
        }
        switch (children.length) {
            case 0:
                return null;
            case 1:
                return children[0];
            default:
                return { type: 3 /* Multi */, content: children };
        }
    }
    function parseXML(xml) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, "text/xml");
        if (doc.getElementsByTagName("parsererror").length) {
            let msg = "Invalid XML in template.";
            const parsererrorText = doc.getElementsByTagName("parsererror")[0].textContent;
            if (parsererrorText) {
                msg += "\nThe parser has produced the following error message:\n" + parsererrorText;
                const re = /\d+/g;
                const firstMatch = re.exec(parsererrorText);
                if (firstMatch) {
                    const lineNumber = Number(firstMatch[0]);
                    const line = xml.split("\n")[lineNumber - 1];
                    const secondMatch = re.exec(parsererrorText);
                    if (line && secondMatch) {
                        const columnIndex = Number(secondMatch[0]) - 1;
                        if (line[columnIndex]) {
                            msg +=
                                `\nThe error might be located at xml line ${lineNumber} column ${columnIndex}\n` +
                                    `${line}\n${"-".repeat(columnIndex - 1)}^`;
                        }
                    }
                }
            }
            throw new Error(msg);
        }
        let tbranch = doc.querySelectorAll("[t-elif], [t-else]");
        for (let i = 0, ilen = tbranch.length; i < ilen; i++) {
            let node = tbranch[i];
            let prevElem = node.previousElementSibling;
            let pattr = (name) => prevElem.getAttribute(name);
            let nattr = (name) => +!!node.getAttribute(name);
            if (prevElem && (pattr("t-if") || pattr("t-elif"))) {
                if (pattr("t-foreach")) {
                    throw new Error("t-if cannot stay at the same level as t-foreach when using t-elif or t-else");
                }
                if (["t-if", "t-elif", "t-else"].map(nattr).reduce(function (a, b) {
                    return a + b;
                }) > 1) {
                    throw new Error("Only one conditional branching directive is allowed per node");
                }
                // All text (with only spaces) and comment nodes (nodeType 8) between
                // branch nodes are removed
                let textNode;
                while ((textNode = node.previousSibling) !== prevElem) {
                    if (textNode.nodeValue.trim().length && textNode.nodeType !== 8) {
                        throw new Error("text is not allowed between branching directives");
                    }
                    textNode.remove();
                }
            }
            else {
                throw new Error("t-elif and t-else directives must be preceded by a t-if or t-elif directive");
            }
        }
        return doc;
    }

    var DomType;
    (function (DomType) {
        DomType[DomType["Text"] = 0] = "Text";
        DomType[DomType["Comment"] = 1] = "Comment";
        DomType[DomType["Node"] = 2] = "Node";
    })(DomType || (DomType = {}));
    function domToString(dom) {
        switch (dom.type) {
            case 0 /* Text */:
                return dom.value;
            case 1 /* Comment */:
                return `<!--${dom.value}-->`;
            case 2 /* Node */:
                const content = dom.content.map(domToString).join("");
                const attrs = [];
                for (let [key, value] of Object.entries(dom.attrs)) {
                    if (!(key === "class" && value === "")) {
                        attrs.push(`${key}="${value}"`);
                    }
                }
                if (content) {
                    return `<${dom.tag}${attrs.length ? " " + attrs.join(" ") : ""}>${content}</${dom.tag}>`;
                }
                else {
                    return `<${dom.tag}${attrs.length ? " " + attrs.join(" ") : ""}/>`;
                }
        }
    }
    function isProp(tag, key) {
        switch (tag) {
            case "input":
                return (key === "checked" ||
                    key === "indeterminate" ||
                    key === "value" ||
                    key === "readonly" ||
                    key === "disabled");
            case "option":
                return key === "selected" || key === "disabled";
            case "textarea":
                return key === "readonly" || key === "disabled";
            case "button":
            case "select":
            case "optgroup":
                return key === "disabled";
        }
        return false;
    }

    class BlockDescription {
        constructor(varName, blockName) {
            this.buildFn = [];
            this.updateFn = [];
            this.currentPath = ["el"];
            this.dataNumber = 0;
            this.handlerNumber = 0;
            this.childNumber = 0;
            this.baseClass = "BNode";
            this.varName = varName;
            this.blockName = blockName;
        }
        insert(dom) {
            if (this.currentDom) {
                this.currentDom.content.push(dom);
            }
            else {
                this.dom = dom;
            }
        }
        insertUpdate(inserter) {
            this.updateFn.push({ path: this.currentPath.slice(), inserter });
        }
        insertBuild(inserter) {
            this.buildFn.push({ path: this.currentPath.slice(), inserter });
        }
    }
    // -----------------------------------------------------------------------------
    // Compiler code
    // -----------------------------------------------------------------------------
    const FNAMEREGEXP = /^[$A-Z_][0-9A-Z_$]*$/i;
    class QWebCompiler {
        constructor(template, name) {
            this.blocks = [];
            this.nextId = 1;
            this.nextBlockId = 1;
            this.shouldProtectScope = false;
            this.shouldDefineOwner = false;
            this.shouldDefineKey0 = false;
            this.hasSafeContext = null;
            this.hasDefinedKey = false;
            this.hasRef = false;
            this.hasTCall = false;
            this.refBlocks = [];
            this.loopLevel = 0;
            this.isDebug = false;
            this.functions = [];
            this.target = { name: "main", signature: "", indentLevel: 0, code: [], rootBlock: null };
            this.template = template;
            this.ast = parse(template);
            // console.warn(this.ast);
            if (name) {
                this.templateName = name;
            }
            else {
                if (template.length > 250) {
                    this.templateName = template.slice(0, 250) + "...";
                }
                else {
                    this.templateName = template;
                }
            }
        }
        compile() {
            const ast = this.ast;
            this.isDebug = ast.type === 12 /* TDebug */;
            this.compileAST(ast, { block: null, index: 0, forceNewBlock: false });
            const code = this.generateCode();
            // console.warn(code);
            return new Function("Blocks, utils", code);
        }
        addLine(line) {
            const prefix = new Array(this.target.indentLevel + 2).join("  ");
            this.target.code.push(prefix + line);
        }
        generateId(prefix = "") {
            return `${prefix}${this.nextId++}`;
        }
        generateBlockName() {
            return `Block${this.blocks.length + 1}`;
        }
        generateSafeCtx() {
            return `Object.assign(Object.create(ctx), ctx)`;
        }
        getNextBlockId() {
            const id = this.nextBlockId;
            return () => {
                return this.nextBlockId !== id ? `b${id}` : null;
            };
        }
        insertAnchor(block) {
            const index = block.childNumber;
            const anchor = { type: 2 /* Node */, tag: "owl-anchor", attrs: {}, content: [] };
            block.insert(anchor);
            block.insertBuild((el) => `this.anchors[${index}] = ${el};`);
            block.currentPath = [`anchors[${block.childNumber}]`];
            block.childNumber++;
        }
        insertBlock(expression, ctx) {
            const { block, index, forceNewBlock } = ctx;
            const shouldBindVar = forceNewBlock || !this.target.rootBlock;
            let prefix = "";
            let parentStr = "";
            let id = null;
            if (shouldBindVar) {
                id = "b" + this.nextBlockId++;
                prefix = `const ${id} = `;
            }
            if (block) {
                parentStr = `${block.varName}.children[${index}] = `;
            }
            this.addLine(`${prefix}${parentStr}${expression};`);
            if (!this.target.rootBlock) {
                this.target.rootBlock = id;
            }
            return id;
        }
        generateCode() {
            let mainCode = this.target.code;
            this.target.code = [];
            this.target.indentLevel = 0;
            // define blocks and utility functions
            this.addLine(`let {BCollection, BComponent, BComponentH, BHtml, BMulti, BNode, BStatic, BText} = Blocks;`);
            this.addLine(`let {elem, toString, withDefault, call, zero, scope, getValues, owner, callSlot} = utils;`);
            // define all blocks
            for (let block of this.blocks) {
                this.generateBlockCode(block);
            }
            // define all slots
            for (let fn of this.functions) {
                this.generateFunctions(fn);
            }
            // micro optimization: remove trailing ctx = ctx.__proto__;
            if (mainCode[mainCode.length - 1] === `  ctx = ctx.__proto__;`) {
                mainCode = mainCode.slice(0, -1);
            }
            // generate main code
            this.target.indentLevel = 0;
            this.addLine(``);
            if (this.hasRef || this.hasTCall) {
                this.addLine(`return (ctx, refs = {}) => {`);
            }
            else {
                this.addLine(`return ctx => {`);
            }
            if (this.shouldProtectScope || this.shouldDefineOwner) {
                this.addLine(`  ctx = Object.create(ctx);`);
            }
            if (this.shouldDefineOwner) {
                this.addLine(`  ctx[scope] = 1;`);
            }
            if (this.shouldDefineKey0) {
                this.addLine(`  let key0;`);
            }
            for (let line of mainCode) {
                this.addLine(line);
            }
            if (!this.target.rootBlock) {
                throw new Error("missing root block");
            }
            if (this.hasRef || this.hasTCall) {
                this.addLine(`  ${this.target.rootBlock}.refs = refs;`);
            }
            this.addLine(`  return ${this.target.rootBlock};`);
            this.addLine("}");
            const code = this.target.code.join("\n");
            if (this.isDebug) {
                const msg = `[Owl Debug]\n${code}`;
                console.log(msg);
            }
            return code;
        }
        generateBlockCode(block) {
            const isStatic = block.buildFn.length === 0 && block.updateFn.length === 0 && block.childNumber === 0;
            if (isStatic) {
                block.baseClass = "BStatic";
            }
            this.addLine(``);
            this.addLine(`class ${block.blockName} extends ${block.baseClass} {`);
            this.target.indentLevel++;
            if (block.dom) {
                this.addLine(`static el = elem(\`${domToString(block.dom)}\`);`);
            }
            if (block.childNumber) {
                this.addLine(`children = new Array(${block.childNumber});`);
                this.addLine(`anchors = new Array(${block.childNumber});`);
            }
            if (block.dataNumber) {
                this.addLine(`data = new Array(${block.dataNumber});`);
            }
            if (block.handlerNumber) {
                this.addLine(`handlers = new Array(${block.handlerNumber});`);
            }
            if (block.buildFn.length) {
                const updateInfo = block.buildFn;
                this.addLine(`build() {`);
                this.target.indentLevel++;
                if (updateInfo.length === 1) {
                    const { path, inserter } = updateInfo[0];
                    const target = `this.${path.join(".")}`;
                    this.addLine(inserter(target));
                }
                else {
                    this.generateFunctionCode(block.buildFn);
                }
                this.target.indentLevel--;
                this.addLine(`}`);
            }
            if (block.updateFn.length) {
                const updateInfo = block.updateFn;
                this.addLine(`update() {`);
                this.target.indentLevel++;
                if (updateInfo.length === 1) {
                    const { path, inserter } = updateInfo[0];
                    const target = `this.${path.join(".")}`;
                    this.addLine(inserter(target));
                }
                else {
                    this.generateFunctionCode(block.updateFn);
                }
                this.target.indentLevel--;
                this.addLine(`}`);
            }
            this.target.indentLevel--;
            this.addLine(`}`);
        }
        generateFunctions(fn) {
            this.addLine("");
            this.addLine(`const ${fn.name} = ${fn.signature}`);
            for (let line of fn.code) {
                this.addLine(line);
            }
            this.addLine(`  return ${fn.rootBlock};`);
            this.addLine(`}`);
        }
        generateFunctionCode(lines) {
            // build tree of paths
            const tree = {};
            let i = 1;
            for (let line of lines) {
                let current = tree;
                let el = `this`;
                for (let p of line.path.slice()) {
                    if (current[p]) ;
                    else {
                        current[p] = { firstChild: null, nextSibling: null };
                    }
                    if (current.firstChild && current.nextSibling && !current.name) {
                        current.name = `el${i++}`;
                        this.addLine(`const ${current.name} = ${el};`);
                    }
                    el = `${current.name ? current.name : el}.${p}`;
                    current = current[p];
                    if (current.target && !current.name) {
                        current.name = `el${i++}`;
                        this.addLine(`const ${current.name} = ${el};`);
                    }
                }
                current.target = true;
            }
            for (let line of lines) {
                const { path, inserter } = line;
                let current = tree;
                let el = `this`;
                for (let p of path.slice()) {
                    current = current[p];
                    if (current) {
                        if (current.name) {
                            el = current.name;
                        }
                        else {
                            el = `${el}.${p}`;
                        }
                    }
                    else {
                        el = `${el}.${p}`;
                    }
                }
                this.addLine(inserter(el));
            }
        }
        captureExpression(expr) {
            const tokens = compileExprToArray(expr);
            const mapping = new Map();
            return tokens
                .map((tok) => {
                if (tok.varName) {
                    if (!mapping.has(tok.varName)) {
                        const varId = this.generateId("v");
                        mapping.set(tok.varName, varId);
                        this.addLine(`const ${varId} = ${tok.value};`);
                    }
                    tok.value = mapping.get(tok.varName);
                }
                return tok.value;
            })
                .join("");
        }
        compileAST(ast, ctx, nextNode) {
            switch (ast.type) {
                case 1 /* Comment */:
                    this.compileComment(ast, ctx);
                    break;
                case 0 /* Text */:
                    this.compileText(ast, ctx);
                    break;
                case 2 /* DomNode */:
                    this.compileTDomNode(ast, ctx);
                    break;
                case 4 /* TEsc */:
                    this.compileTEsc(ast, ctx);
                    break;
                case 8 /* TRaw */:
                    this.compileTRaw(ast, ctx);
                    break;
                case 5 /* TIf */:
                    this.compileTIf(ast, ctx, nextNode);
                    break;
                case 9 /* TForEach */:
                    this.compileTForeach(ast, ctx);
                    break;
                case 10 /* TKey */:
                    this.compileTKey(ast, ctx);
                    break;
                case 3 /* Multi */:
                    this.compileMulti(ast, ctx);
                    break;
                case 7 /* TCall */:
                    this.compileTCall(ast, ctx);
                    break;
                case 6 /* TSet */:
                    this.compileTSet(ast);
                    break;
                case 11 /* TComponent */:
                    this.compileComponent(ast, ctx);
                    break;
                case 12 /* TDebug */:
                    this.compileDebug(ast, ctx);
                    break;
                case 13 /* TLog */:
                    this.compileLog(ast, ctx);
                    break;
                case 14 /* TSlot */:
                    this.compileTSlot(ast, ctx);
                    break;
            }
        }
        compileDebug(ast, ctx) {
            this.addLine(`debugger;`);
            if (ast.content) {
                this.compileAST(ast.content, ctx);
            }
        }
        compileLog(ast, ctx) {
            this.addLine(`console.log(${compileExpr(ast.expr)});`);
            if (ast.content) {
                this.compileAST(ast.content, ctx);
            }
        }
        compileComment(ast, ctx) {
            let { block, forceNewBlock } = ctx;
            if (!block || forceNewBlock) {
                const name = this.generateBlockName();
                const id = this.insertBlock(`new ${name}()`, ctx);
                block = new BlockDescription(id, name);
                this.blocks.push(block);
            }
            const text = { type: 1 /* Comment */, value: ast.value };
            block.insert(text);
        }
        compileText(ast, ctx) {
            let { block, forceNewBlock } = ctx;
            if (!block || forceNewBlock) {
                this.insertBlock(`new BText(\`${ast.value}\`)`, {
                    ...ctx,
                    forceNewBlock: forceNewBlock && !block,
                });
            }
            else {
                const type = ast.type === 0 /* Text */ ? 0 /* Text */ : 1 /* Comment */;
                const text = { type, value: ast.value };
                block.insert(text);
            }
        }
        generateHandlerCode(block, handlers, insert) {
            for (let event in handlers) {
                this.shouldDefineOwner = true;
                const index = block.handlerNumber;
                block.handlerNumber++;
                if (insert) {
                    insert(index);
                }
                const value = handlers[event];
                let args = "";
                let code = "";
                const name = value.replace(/\(.*\)/, function (_args) {
                    args = _args.slice(1, -1);
                    return "";
                });
                const isMethodCall = name.match(FNAMEREGEXP);
                if (isMethodCall) {
                    if (args) {
                        const argId = this.generateId("arg");
                        this.addLine(`const ${argId} = [${compileExpr(args)}];`);
                        code = `owner(ctx)['${name}'](...${argId}, e)`;
                    }
                    else {
                        code = `owner(ctx)['${name}'](e)`;
                    }
                }
                else {
                    code = this.captureExpression(value);
                }
                this.addLine(`${block.varName}.handlers[${index}] = [\`${event}\`, (e) => ${code}, ctx];`);
            }
        }
        compileTDomNode(ast, ctx) {
            let { block, forceNewBlock } = ctx;
            if (!block || forceNewBlock) {
                const name = this.generateBlockName();
                const id = this.insertBlock(`new ${name}()`, ctx);
                block = new BlockDescription(id, name);
                this.blocks.push(block);
            }
            // attributes
            const staticAttrs = {};
            const dynAttrs = {};
            for (let key in ast.attrs) {
                if (key.startsWith("t-attf")) {
                    dynAttrs[key.slice(7)] = interpolate(ast.attrs[key]);
                }
                else if (key.startsWith("t-att")) {
                    dynAttrs[key.slice(6)] = compileExpr(ast.attrs[key]);
                }
                else {
                    staticAttrs[key] = ast.attrs[key];
                }
            }
            if (Object.keys(dynAttrs).length) {
                for (let key in dynAttrs) {
                    const idx = block.dataNumber;
                    block.dataNumber++;
                    this.addLine(`${block.varName}.data[${idx}] = ${dynAttrs[key]};`);
                    if (key === "class") {
                        block.insertUpdate((el) => `this.updateClass(${el}, this.data[${idx}]);`);
                    }
                    else {
                        if (key) {
                            block.insertUpdate((el) => `this.updateAttr(${el}, \`${key}\`, this.data[${idx}]);`);
                            if (isProp(ast.tag, key)) {
                                block.insertUpdate((el) => `this.updateProp(${el}, \`${key}\`, this.data[${idx}]);`);
                            }
                        }
                        else {
                            block.insertUpdate((el) => `this.updateAttrs(${el}, this.data[${idx}]);`);
                        }
                    }
                }
            }
            // event handlers
            const insert = (index) => block.insertBuild((el) => `this.setupHandler(${el}, ${index});`);
            this.generateHandlerCode(block, ast.on, insert);
            // t-ref
            if (ast.ref) {
                this.hasRef = true;
                this.refBlocks.push(block.varName);
                if (this.target.rootBlock !== block.varName) {
                    this.addLine(`${block.varName}.refs = refs;`);
                }
                const isDynamic = INTERP_REGEXP.test(ast.ref);
                if (isDynamic) {
                    const str = ast.ref.replace(INTERP_REGEXP, (expr) => this.captureExpression(expr));
                    const index = block.dataNumber;
                    block.dataNumber++;
                    const expr = str.replace(INTERP_GROUP_REGEXP, (s) => "${" + s.slice(2, -2) + "}");
                    this.addLine(`${block.varName}.data[${index}] = \`${expr}\`;`);
                    block.insertUpdate((el) => `this.refs[this.data[${index}]] = ${el};`);
                }
                else {
                    block.insertUpdate((el) => `this.refs[\`${ast.ref}\`] = ${el};`);
                }
            }
            const dom = { type: 2 /* Node */, tag: ast.tag, attrs: staticAttrs, content: [] };
            block.insert(dom);
            if (ast.content.length) {
                const initialDom = block.currentDom;
                block.currentDom = dom;
                const path = block.currentPath.slice();
                block.currentPath.push("firstChild");
                const children = ast.content;
                for (let i = 0; i < children.length; i++) {
                    const child = ast.content[i];
                    const subCtx = {
                        block: block,
                        index: block.childNumber,
                        forceNewBlock: false,
                    };
                    const next = children[i + 1] && children[i + 1].type === 2 /* DomNode */
                        ? children[i + 1]
                        : undefined;
                    this.compileAST(child, subCtx, next);
                    if (child.type !== 6 /* TSet */) {
                        block.currentPath.push("nextSibling");
                    }
                }
                block.currentPath = path;
                block.currentDom = initialDom;
            }
        }
        compileTEsc(ast, ctx) {
            let { block, forceNewBlock } = ctx;
            let expr;
            if (ast.expr === "0") {
                expr = `ctx[zero]`;
            }
            else {
                expr = compileExpr(ast.expr);
                if (ast.defaultValue) {
                    expr = `withDefault(${expr}, \`${ast.defaultValue}\`)`;
                }
            }
            if (!block || forceNewBlock) {
                this.insertBlock(`new BText(${expr})`, { ...ctx, forceNewBlock: forceNewBlock && !block });
            }
            else {
                const text = { type: 2 /* Node */, tag: "owl-text", attrs: {}, content: [] };
                block.insert(text);
                const idx = block.dataNumber;
                block.dataNumber++;
                this.addLine(`${block.varName}.data[${idx}] = ${expr};`);
                if (ast.expr === "0") {
                    block.insertUpdate((el) => `${el}.textContent = this.data[${idx}];`);
                }
                else {
                    block.insertUpdate((el) => `${el}.textContent = toString(this.data[${idx}]);`);
                }
            }
        }
        compileTRaw(ast, ctx) {
            let { block, index } = ctx;
            if (!block) {
                const id = this.insertBlock("new BMulti(1)", ctx);
                block = new BlockDescription(id, "BMulti");
            }
            this.insertAnchor(block);
            let expr = ast.expr === "0" ? "ctx[zero]" : compileExpr(ast.expr);
            if (ast.body) {
                const nextIdCb = this.getNextBlockId();
                const subCtx = { block: null, index: 0, forceNewBlock: true };
                this.compileAST({ type: 3 /* Multi */, content: ast.body }, subCtx);
                const nextId = nextIdCb();
                if (nextId) {
                    expr = `withDefault(${expr}, ${nextId})`;
                }
            }
            this.addLine(`${block.varName}.children[${index}] = new BHtml(${expr});`);
        }
        compileTIf(ast, ctx, nextNode) {
            let { block, index } = ctx;
            if (!block) {
                const n = 1 + (ast.tElif ? ast.tElif.length : 0) + (ast.tElse ? 1 : 0);
                const id = this.insertBlock(`new BMulti(${n})`, ctx);
                block = new BlockDescription(id, "BMulti");
            }
            this.addLine(`if (${compileExpr(ast.condition)}) {`);
            this.target.indentLevel++;
            this.insertAnchor(block);
            const subCtx = { block: block, index: index, forceNewBlock: true };
            this.compileAST(ast.content, subCtx);
            this.target.indentLevel--;
            if (ast.tElif) {
                for (let clause of ast.tElif) {
                    this.addLine(`} else if (${compileExpr(clause.condition)}) {`);
                    this.target.indentLevel++;
                    block.currentPath.push("nextSibling");
                    this.insertAnchor(block);
                    const subCtx = {
                        block: block,
                        index: block.childNumber - 1,
                        forceNewBlock: true,
                    };
                    this.compileAST(clause.content, subCtx);
                    this.target.indentLevel--;
                }
            }
            if (ast.tElse) {
                this.addLine(`} else {`);
                this.target.indentLevel++;
                block.currentPath.push("nextSibling");
                this.insertAnchor(block);
                const subCtx = {
                    block: block,
                    index: block.childNumber - 1,
                    forceNewBlock: true,
                };
                this.compileAST(ast.tElse, subCtx);
                this.target.indentLevel--;
            }
            this.addLine("}");
        }
        compileTForeach(ast, ctx) {
            const { block } = ctx;
            const cId = this.generateId();
            const vals = `v${cId}`;
            const keys = `k${cId}`;
            const l = `l${cId}`;
            this.addLine(`const [${vals}, ${keys}, ${l}] = getValues(${compileExpr(ast.collection)});`);
            if (block) {
                this.insertAnchor(block);
            }
            const id = this.insertBlock(`new BCollection(${l})`, { ...ctx, forceNewBlock: true });
            this.loopLevel++;
            const loopVar = `i${this.loopLevel}`;
            this.addLine(`ctx = Object.create(ctx);`);
            this.addLine(`for (let ${loopVar} = 0; ${loopVar} < ${l}; ${loopVar}++) {`);
            this.target.indentLevel++;
            this.addLine(`ctx[\`${ast.elem}\`] = ${vals}[${loopVar}];`);
            this.addLine(`ctx[\`${ast.elem}_first\`] = ${loopVar} === 0;`);
            this.addLine(`ctx[\`${ast.elem}_last\`] = ${loopVar} === ${vals}.length - 1;`);
            this.addLine(`ctx[\`${ast.elem}_index\`] = ${loopVar};`);
            this.addLine(`ctx[\`${ast.elem}_value\`] = ${keys}[${loopVar}];`);
            this.addLine(`let key${this.loopLevel} = ${ast.key ? compileExpr(ast.key) : loopVar};`);
            const collectionBlock = new BlockDescription(id, "Collection");
            const subCtx = {
                block: collectionBlock,
                index: loopVar,
                forceNewBlock: true,
            };
            const initialState = this.hasDefinedKey;
            this.hasDefinedKey = false;
            this.compileAST(ast.body, subCtx);
            // const key = this.key || loopVar;
            if (!ast.key && !this.hasDefinedKey) {
                console.warn(`"Directive t-foreach should always be used with a t-key! (in template: '${this.templateName}')"`);
            }
            this.addLine(`${id}.keys[${loopVar}] = key${this.loopLevel};`);
            this.hasDefinedKey = initialState;
            this.target.indentLevel--;
            this.addLine(`}`);
            this.loopLevel--;
            this.addLine(`ctx = ctx.__proto__;`);
        }
        compileTKey(ast, ctx) {
            if (this.loopLevel === 0) {
                this.shouldDefineKey0 = true;
            }
            this.addLine(`key${this.loopLevel} = ${compileExpr(ast.expr)};`);
            this.hasDefinedKey = true;
            this.compileAST(ast.content, ctx);
        }
        compileMulti(ast, ctx) {
            let { block, forceNewBlock } = ctx;
            if (!block || forceNewBlock) {
                const n = ast.content.filter((c) => c.type !== 6 /* TSet */).length;
                if (n <= 1) {
                    for (let child of ast.content) {
                        this.compileAST(child, ctx);
                    }
                    return;
                }
                const id = this.insertBlock(`new BMulti(${n})`, ctx);
                block = new BlockDescription(id, "BMulti");
            }
            let index = 0;
            for (let i = 0; i < ast.content.length; i++) {
                const child = ast.content[i];
                const isTSet = child.type === 6 /* TSet */;
                const subCtx = { block: block, index: index, forceNewBlock: !isTSet };
                this.compileAST(child, subCtx);
                if (!isTSet) {
                    index++;
                }
            }
        }
        compileTCall(ast, ctx) {
            const { block, forceNewBlock } = ctx;
            this.shouldDefineOwner = true;
            this.hasTCall = true;
            if (ast.body) {
                const targetRoot = this.target.rootBlock;
                this.addLine(`ctx = Object.create(ctx);`);
                const nextIdCb = this.getNextBlockId();
                const subCtx = { block: null, index: 0, forceNewBlock: true };
                this.compileAST({ type: 3 /* Multi */, content: ast.body }, subCtx);
                const nextId = nextIdCb();
                if (nextId) {
                    this.addLine(`ctx[zero] = ${nextId};`);
                }
                this.target.rootBlock = targetRoot;
            }
            const isDynamic = INTERP_REGEXP.test(ast.name);
            const subTemplate = isDynamic ? interpolate(ast.name) : "`" + ast.name + "`";
            if (block) {
                if (!forceNewBlock) {
                    this.insertAnchor(block);
                }
            }
            this.insertBlock(`call(${subTemplate}, ctx, refs)`, { ...ctx, forceNewBlock: !block });
            if (ast.body) {
                this.addLine(`ctx = ctx.__proto__;`);
            }
        }
        compileTSet(ast) {
            this.shouldProtectScope = true;
            const expr = ast.value ? compileExpr(ast.value || "") : "null";
            if (ast.body) {
                const nextIdCb = this.getNextBlockId();
                const subCtx = { block: null, index: 0, forceNewBlock: true };
                this.compileAST({ type: 3 /* Multi */, content: ast.body }, subCtx);
                const nextId = nextIdCb();
                const value = ast.value ? (nextId ? `withDefault(${expr}, ${nextId})` : expr) : nextId;
                this.addLine(`ctx[\`${ast.name}\`] = ${value};`);
            }
            else {
                let value;
                if (ast.defaultValue) {
                    if (ast.value) {
                        value = `withDefault(${expr}, \`${ast.defaultValue}\`)`;
                    }
                    else {
                        value = `\`${ast.defaultValue}\``;
                    }
                }
                else {
                    value = expr;
                }
                this.addLine(`ctx[\`${ast.name}\`] = ${value};`);
            }
        }
        compileComponent(ast, ctx) {
            const { block } = ctx;
            // props
            const props = [];
            for (let p in ast.props) {
                props.push(`${p}: ${compileExpr(ast.props[p]) || undefined}`);
            }
            const propString = `{${props.join(",")}}`;
            // cmap key
            const parts = [this.generateId("__")];
            for (let i = 0; i < this.loopLevel; i++) {
                parts.push(`\${key${i + 1}}`);
            }
            const key = parts.join("__");
            const blockArgs = `\`${ast.name}\`, ${propString}, \`${key}\`, ctx`;
            // slots
            const hasSlot = !!Object.keys(ast.slots).length;
            let slotId;
            if (hasSlot) {
                if (this.hasSafeContext === null) {
                    this.hasSafeContext = !this.template.includes("t-set") && !this.template.includes("t-call");
                }
                let ctxStr = "ctx";
                if (this.loopLevel || !this.hasSafeContext) {
                    ctxStr = this.generateId("ctx");
                    this.addLine(`const ${ctxStr} = ${this.generateSafeCtx()};`);
                }
                slotId = this.generateId("slots");
                let slotStr = [];
                const initialTarget = this.target;
                for (let slotName in ast.slots) {
                    let name = this.generateId("slot");
                    const slot = {
                        name,
                        signature: "ctx => () => {",
                        indentLevel: 0,
                        code: [],
                        rootBlock: null,
                    };
                    this.functions.push(slot);
                    this.target = slot;
                    const subCtx = { block: null, index: 0, forceNewBlock: true };
                    const nextId = this.getNextBlockId();
                    this.compileAST(ast.slots[slotName], subCtx);
                    if (this.hasRef) {
                        slot.signature = "(ctx, refs) => () => {";
                        slotStr.push(`'${slotName}': ${name}(${ctxStr}, refs)`);
                        const id = nextId();
                        if (id) {
                            this.addLine(`${id}.refs = refs;`);
                        }
                    }
                    else {
                        slotStr.push(`'${slotName}': ${name}(${ctxStr})`);
                    }
                }
                this.target = initialTarget;
                this.addLine(`const ${slotId} = {${slotStr.join(", ")}};`);
            }
            if (block) {
                this.insertAnchor(block);
            }
            let id;
            if (Object.keys(ast.handlers).length) {
                // event handlers
                const n = Object.keys(ast.handlers).length;
                id = this.insertBlock(`new BComponentH(${n}, ${blockArgs})`, {
                    ...ctx,
                    forceNewBlock: true,
                });
                const cblock = { varName: id, handlerNumber: 0 };
                this.generateHandlerCode(cblock, ast.handlers);
            }
            else {
                id = this.insertBlock(`new BComponent(${blockArgs})`, { ...ctx, forceNewBlock: hasSlot });
            }
            if (hasSlot) {
                this.addLine(`${id}.component.__owl__.slots = ${slotId};`);
            }
        }
        compileTSlot(ast, ctx) {
            const { block } = ctx;
            let blockString;
            if (ast.defaultContent) {
                let name = this.generateId("defaultSlot");
                const slot = {
                    name,
                    signature: "ctx => {",
                    indentLevel: 0,
                    code: [],
                    rootBlock: null,
                };
                this.functions.push(slot);
                const initialTarget = this.target;
                const subCtx = { block: null, index: 0, forceNewBlock: true };
                this.target = slot;
                this.compileAST(ast.defaultContent, subCtx);
                this.target = initialTarget;
                blockString = `callSlot(ctx, '${ast.name}', ${name})`;
            }
            else {
                blockString = `callSlot(ctx, '${ast.name}')`;
            }
            if (block) {
                this.insertAnchor(block);
            }
            this.insertBlock(blockString, { ...ctx, forceNewBlock: false });
        }
    }

    function compileTemplate(template, name) {
        const compiler = new QWebCompiler(template, name);
        return compiler.compile();
    }

    // -----------------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------------
    function toDom(node) {
        switch (node.nodeType) {
            case 1: {
                // HTMLElement
                const tagName = node.tagName;
                if (tagName === "owl-text" || tagName === "owl-anchor") {
                    return document.createTextNode("");
                }
                const result = document.createElement(node.tagName);
                const attrs = node.attributes;
                for (let i = 0; i < attrs.length; i++) {
                    result.setAttribute(attrs[i].name, attrs[i].value);
                }
                for (let child of node.childNodes) {
                    result.appendChild(toDom(child));
                }
                return result;
            }
            case 3: {
                // text node
                return document.createTextNode(node.textContent);
            }
            case 8: {
                // comment node
                return document.createComment(node.textContent);
            }
        }
        throw new Error("boom");
    }
    function elem(html) {
        const doc = new DOMParser().parseFromString(html, "text/xml");
        return toDom(doc.firstChild);
    }
    function toString(value) {
        switch (typeof value) {
            case "string":
                return value;
            case "number":
                return String(value);
            case "boolean":
                return value ? "true" : "false";
            case "undefined":
                return "";
            case "object":
                return value ? value.toString() : "";
        }
        throw new Error("not yet working" + value);
    }
    function withDefault(value, defaultValue) {
        return value === undefined || value === null || value === false ? defaultValue : value;
    }
    function getValues(collection) {
        if (Array.isArray(collection)) {
            return [collection, collection, collection.length];
        }
        else if (collection) {
            const keys = Object.keys(collection);
            return [keys, Object.values(collection), keys.length];
        }
        throw new Error("Invalid loop expression");
    }
    const scope = Symbol("scope");
    function owner(obj) {
        while (obj && obj[scope]) {
            obj = obj.__proto__;
        }
        return obj;
    }
    function callSlot(ctx, name, def) {
        const slots = ctx.__owl__.slots;
        const slotBDom = slots ? slots[name]() : null;
        if (def) {
            const result = new BMulti(2);
            if (slotBDom) {
                result.children[0] = slotBDom;
            }
            else {
                result.children[1] = def(ctx);
            }
            return result;
        }
        return slotBDom;
    }

    // -----------------------------------------------------------------------------
    //  Scheduler
    // -----------------------------------------------------------------------------
    class Scheduler {
        constructor(requestAnimationFrame) {
            this.tasks = [];
            this.isRunning = false;
            this.requestAnimationFrame = requestAnimationFrame;
        }
        start() {
            this.isRunning = true;
            this.scheduleTasks();
        }
        stop() {
            this.isRunning = false;
        }
        addFiber(fiber) {
            this.tasks.push(fiber);
            if (!this.isRunning) {
                this.start();
            }
        }
        /**
         * Process all current tasks. This only applies to the fibers that are ready.
         * Other tasks are left unchanged.
         */
        flush() {
            let tasks = this.tasks;
            this.tasks = [];
            tasks = tasks.filter((fiber) => {
                if (fiber.counter === 0) {
                    if (!fiber.error) {
                        fiber.complete();
                    }
                    fiber.resolve();
                    return false;
                }
                return true;
            });
            this.tasks = tasks.concat(this.tasks);
            if (this.tasks.length === 0) {
                this.stop();
            }
        }
        scheduleTasks() {
            this.requestAnimationFrame(() => {
                this.flush();
                if (this.isRunning) {
                    this.scheduleTasks();
                }
            });
        }
    }

    // -----------------------------------------------------------------------------
    //  Global templates
    // -----------------------------------------------------------------------------
    let nextId = 1;
    const globalTemplates = {};
    function xml(strings, ...args) {
        const name = `__template__${nextId++}`;
        const value = String.raw(strings, ...args);
        globalTemplates[name] = value;
        return name;
    }

    // -----------------------------------------------------------------------------
    //  TemplateSet
    // -----------------------------------------------------------------------------
    const UTILS = {
        elem,
        toString,
        withDefault,
        call: (name) => {
            throw new Error(`Missing template: ${name}`);
        },
        zero: Symbol("zero"),
        scope,
        getValues,
        owner,
        callSlot,
    };
    class App {
        constructor() {
            this.rawTemplates = Object.create(globalTemplates);
            this.templates = {};
            this.scheduler = new Scheduler(window.requestAnimationFrame.bind(window));
            const call = (subTemplate, ctx, refs) => {
                const template = this.getTemplate(subTemplate);
                return template(ctx, refs);
            };
            this.utils = Object.assign({}, UTILS, { call });
        }
        addTemplate(name, template, allowDuplicate = false) {
            if (name in this.rawTemplates && !allowDuplicate) {
                throw new Error(`Template ${name} already defined`);
            }
            this.rawTemplates[name] = template;
        }
        getTemplate(name) {
            if (!(name in this.templates)) {
                const rawTemplate = this.rawTemplates[name];
                if (rawTemplate === undefined) {
                    throw new Error(`Missing template: "${name}"`);
                }
                const templateFn = compileTemplate(rawTemplate, name);
                const template = templateFn(Blocks, this.utils);
                this.templates[name] = template;
            }
            return this.templates[name];
        }
    }

    // -----------------------------------------------------------------------------
    //  Internal rendering stuff
    // -----------------------------------------------------------------------------
    class BaseFiber {
        constructor(__owl__) {
            this.bdom = null;
            this.child = null;
            this.sibling = null;
            this.__owl__ = __owl__;
        }
        mountComponents() {
            if (this.child) {
                this.child.mountComponents();
            }
            if (this.sibling) {
                this.sibling.mountComponents();
            }
            this.__owl__.mountedCB();
            this.__owl__.isMounted = true;
        }
    }
    class ChildFiber extends BaseFiber {
        constructor(__owl__, parent) {
            super(__owl__);
            this.bdom = null;
            this.parent = parent;
            const root = parent.root;
            root.counter++;
            root.childNumber++;
            this.root = root;
        }
    }
    class RootFiber extends BaseFiber {
        constructor() {
            super(...arguments);
            this.counter = 1;
            this.childNumber = 1;
            this.root = this;
            this.promise = new Promise((resolve, reject) => {
                this.resolve = resolve;
                this.reject = reject;
            });
        }
        complete() {
            this.__owl__.bdom.patch(this.bdom);
        }
    }
    class MountingFiber extends RootFiber {
        constructor(__owl__, target) {
            super(__owl__);
            this.target = target;
        }
        complete() {
            const __owl__ = this.__owl__;
            __owl__.bdom = __owl__.fiber.bdom;
            __owl__.bdom.mount(this.target);
            if (document.body.contains(this.target)) {
                this.mountComponents();
            }
        }
    }

    class Component {
        constructor(props) {
            this.__owl__ = currentData;
            this.env = currentEnv;
            current = this;
            const __owl__ = currentData;
            __owl__.willStartCB = this.willStart.bind(this);
            __owl__.mountedCB = this.mounted.bind(this);
            this.props = props;
        }
        setup() { }
        async willStart() { }
        async willUpdateProps(props) { }
        mounted() { }
        get el() {
            const bdom = this.__owl__.bdom;
            return bdom ? bdom.el : null;
        }
        async render() {
            const __owl__ = this.__owl__;
            const fiber = new RootFiber(__owl__);
            __owl__.app.scheduler.addFiber(fiber);
            internalRender(this, fiber);
            await fiber.promise;
        }
    }
    // -----------------------------------------------------------------------------
    //  Component Block
    // -----------------------------------------------------------------------------
    class BComponent extends Block {
        constructor(name, props, key, ctx) {
            super();
            const parentData = ctx.__owl__;
            let component = parentData.children[key];
            if (component) {
                // update
                const fiber = new ChildFiber(component.__owl__, parentData.fiber);
                const parentFiber = parentData.fiber;
                parentFiber.child = fiber; // wrong!
                updateAndRender(component, fiber, props);
            }
            else {
                // new component
                const components = ctx.constructor.components || ctx.components;
                const C = components[name];
                component = prepare(C, props, parentData.app);
                parentData.children[key] = component;
                const fiber = new ChildFiber(component.__owl__, parentData.fiber);
                const parentFiber = parentData.fiber;
                parentFiber.child = fiber; // wrong!
                internalRender(component, fiber);
            }
            this.component = component;
        }
        firstChildNode() {
            const bdom = this.component.__owl__.bdom;
            return bdom ? bdom.firstChildNode() : null;
        }
        mountBefore(anchor) {
            this.component.__owl__.bdom = this.component.__owl__.fiber.bdom;
            this.component.__owl__.bdom.mountBefore(anchor);
        }
        patch() {
            this.component.__owl__.bdom.patch(this.component.__owl__.fiber.bdom);
        }
    }
    class BComponentH extends BComponent {
        constructor(handlers, name, props, key, ctx) {
            super(name, props, key, ctx);
            this.handlers = new Array(handlers);
        }
        mountBefore(anchor) {
            super.mountBefore(anchor);
            this.setupHandlers();
        }
        setupHandlers() {
            for (let i = 0; i < this.handlers.length; i++) {
                const handler = this.handlers[i];
                const eventType = handler[0];
                const el = this.component.el;
                el.addEventListener(eventType, () => {
                    const info = this.handlers[i];
                    const [, callback, ctx] = info;
                    if (ctx.__owl__ && !ctx.__owl__.isMounted) {
                        return;
                    }
                    callback();
                });
            }
        }
    }
    async function updateAndRender(component, fiber, props) {
        const componentData = component.__owl__;
        componentData.fiber = fiber;
        await component.willUpdateProps(props);
        component.props = props;
        fiber.bdom = componentData.render();
        fiber.root.counter--;
    }
    Blocks.BComponent = BComponent;
    Blocks.BComponentH = BComponentH;
    let current = null;
    let currentData;
    let currentEnv;
    async function mount(C, params) {
        if (!(params.target instanceof HTMLElement || params.target instanceof DocumentFragment)) {
            throw new Error("Cannot mount component: the target is not a valid DOM element");
        }
        if (C instanceof Component) {
            // we move component elsewhere
            C.__owl__.bdom.move(params.target);
            return;
        }
        const { target, props, env, app } = params;
        currentEnv = env || {};
        const componentApp = app ? (app instanceof App ? app : app.__owl__.app) : new App();
        const component = prepare(C, props || {}, componentApp);
        const __owl__ = component.__owl__;
        const fiber = new MountingFiber(__owl__, target);
        __owl__.app.scheduler.addFiber(fiber);
        internalRender(component, fiber);
        await fiber.promise;
        return component;
    }
    function prepare(C, props, app) {
        let component;
        let template = C.template;
        if (!template) {
            throw new Error(`Could not find template for component "${C.name}"`);
        }
        const __owl__ = {
            render: null,
            bdom: null,
            fiber: null,
            willStartCB: null,
            mountedCB: null,
            isMounted: false,
            children: {},
            app,
        };
        currentData = __owl__;
        component = new C(props);
        component.setup();
        __owl__.render = app.getTemplate(template).bind(null, component);
        return component;
    }
    async function internalRender(c, fiber) {
        const __owl__ = c.__owl__;
        __owl__.fiber = fiber;
        await __owl__.willStartCB();
        fiber.bdom = __owl__.render();
        fiber.root.counter--;
    }
    function useComponent() {
        return current;
    }
    function useComponentData() {
        return currentData;
    }

    const observers = new WeakMap();
    /**
     * PSet (for Prototypal Set) are sets that can lookup in their "parent sets", if
     * any.
     */
    class PSet extends Set {
        static createChild(parent) {
            const pset = new PSet();
            pset.parent = parent;
            return pset;
        }
        has(key) {
            if (super.has(key)) {
                return true;
            }
            return this.parent ? this.parent.has(key) : false;
        }
        *[Symbol.iterator]() {
            let iterator = super[Symbol.iterator]();
            for (let elem of iterator) {
                yield elem;
            }
            if (this.parent) {
                for (let elem of this.parent) {
                    yield elem;
                }
            }
        }
    }
    // -----------------------------------------------------------------------------
    function observe(value, cb) {
        if (isNotObservable(value)) {
            return value;
        }
        if (observers.has(value)) {
            const callbacks = observers.get(value);
            callbacks.add(cb);
            return value;
        }
        const callbacks = new PSet();
        callbacks.add(cb);
        return observeValue(value, callbacks);
    }
    function isNotObservable(value) {
        return (value === null || typeof value !== "object" || value instanceof Date || value instanceof Promise);
    }
    /**
     * value should
     * 1. be observable
     * 2. not yet be observed
     */
    function observeValue(value, callbacks) {
        const proxy = new Proxy(value, {
            get(target, key) {
                const current = target[key];
                if (isNotObservable(current)) {
                    return current;
                }
                if (observers.has(current)) {
                    // this is wrong ?
                    observers.get(current).parent = callbacks;
                    return current;
                }
                const subCallbacks = PSet.createChild(callbacks);
                const subValue = observeValue(current, subCallbacks);
                target[key] = subValue;
                return subValue;
            },
            set(target, key, value) {
                // TODO: check if current !== target or proxy ??
                const current = target[key];
                if (current !== value) {
                    if (isNotObservable(value)) {
                        target[key] = value;
                    }
                    else {
                        // TODO: test following scenario:
                        // 1. obj1 = observer({a:1}, somecb);
                        // 2. unobserve(obj1, somecb)
                        // 3. obj1.a = {b: 2};
                        // check that somecb was not called
                        // obj1.a.b = 3;
                        // check again that somecb was not called
                        if (observers.has(value)) {
                            const pset = observers.get(value);
                            pset.parent = callbacks;
                            target[key] = value;
                        }
                        else {
                            const subCallbacks = PSet.createChild(callbacks);
                            target[key] = observeValue(value, subCallbacks);
                        }
                    }
                    notify(target);
                }
                return true;
            },
            deleteProperty(target, key) {
                if (key in target) {
                    delete target[key];
                    notify(target);
                }
                return true;
            },
        });
        observers.set(value, callbacks);
        observers.set(proxy, callbacks);
        return proxy;
    }
    function notify(value) {
        const cbs = observers.get(value);
        for (let cb of cbs) {
            cb();
        }
    }

    // -----------------------------------------------------------------------------
    //  hooks
    // -----------------------------------------------------------------------------
    function useState(state) {
        const component = useComponent();
        return observe(state, () => component.render());
    }
    function onWillStart(cb) {
        const component = useComponent();
        const currentData = component.__owl__;
        const prev = currentData.willStartCB;
        currentData.willStartCB = () => {
            return Promise.all([prev.call(component), cb.call(component)]);
        };
    }
    function onMounted(cb) {
        const component = useComponent();
        const currentData = component.__owl__;
        const prev = currentData.mountedCB;
        currentData.mountedCB = () => {
            prev();
            cb.call(component);
        };
    }
    function useRef(name) {
        const __owl__ = useComponentData();
        return {
            get el() {
                const val = __owl__.bdom && __owl__.bdom.refs && __owl__.bdom.refs[name];
                return val;
                // if (val instanceof HTMLElement) {
                //   return val;
                // } else if (val instanceof Component) {
                //   return val.el;
                // }
                // return null;
            },
            get comp() {
                return null;
                // const val = __owl__.refs && __owl__.refs[name];
                // return val instanceof Component ? (val as C) : null;
            },
        };
    }

    var _hooks = {
        __proto__: null,
        useState: useState,
        onWillStart: onWillStart,
        onMounted: onMounted,
        useRef: useRef
    };

    /**
     * This file is the main file packaged by rollup (see rollup.config.js).  From
     * this file, we export all public owl elements.
     *
     * Note that dynamic values, such as a date or a commit hash are added by rollup
     */
    const hooks = Object.assign(_hooks, { useComponent: useComponent });
    const __info__ = {};

    exports.App = App;
    exports.Component = Component;
    exports.__info__ = __info__;
    exports.hooks = hooks;
    exports.mount = mount;
    exports.useComponent = useComponent;
    exports.useState = useState;
    exports.xml = xml;


    __info__.version = '1.0.13';
    __info__.date = '2020-12-18T12:16:26.852Z';
    __info__.hash = 'e2a7ab7';
    __info__.url = 'https://github.com/odoo/owl';


}(this.owl = this.owl || {}));