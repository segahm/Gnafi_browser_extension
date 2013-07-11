function dmp(str){
	dump(':'+str+'\r\n');
}
String.prototype.trim = function(){ return this.replace(/^\s+|\s+$/g,'') }
//makes text safe for html view
String.prototype.unescHtml = function(){
	r = this;
	var e = [['<','&lt;'],['>','&gt;'],['&','&amp;'],['"','&quot;']];
	for(var i=0;i<e.length;i++){
		r = r.strReplace(e[i][0],e[i][1])}
	return r;
}
RegExp.escape = function(text) {
  if (!arguments.callee.sRE) {
    var specials = [
      '/', '.', '*', '+', '?', '|',
      '(', ')', '[', ']', '{', '}', '\\'
    ];
    arguments.callee.sRE = new RegExp(
      '(\\' + specials.join('|\\') + ')', 'g'
    );
  }
  return text.replace(arguments.callee.sRE, '\\$1');
}
//v is either a string or an array
//return 0 if false, index of the element +1 if found
function startsWith(v,data){
	if (typeof data == 'undefined')data = this;
	var res = 0;
	if (v instanceof Array){
		for (var i = 0;i<v.length;i++){
			if (data.substr(0,v[i].length) == v[i]){
				res = (i+1);
				break;
			}
		}
	}else{
		if (data.substr(0,v.length) == v)
			res = 1;
	}
	return res;
}
String.prototype.startsWith = startsWith;
String.prototype.endsWith = function(v){
	var res = 0;
	if (v instanceof Array){
		for (var i = 0;i<v.length;i++){
			if (this.length >= v[i].length
					&& this.substr(this.length-v[i].length) == v[i]){
				res = (i+1);
				break;
			}
		}
	}else{
		if (this.substr(this.length-v.length) == v)
			res = 1;
	}
	return res;
}
//string replace without using reg exp
String.prototype.strReplace = function(search,replaceWith){
	var pos = 0;
	var l = search.length;
	var str = this;
	while ((pos = this.indexOf(search,pos)) != -1){
		str = str.substr(0,pos)+replaceWith+str.substr(pos+l);
		pos += l;
	}
	return str;
}
//gets rid of all html tags
String.prototype.stripHTML = function(){
	return this.replace(/(<([^>]+)>)/ig,"").replace(/[\r\n ]/g," ").trim();
}
function wrapInto(w,o){for(var v in o){eval('w.'+v+' = o.'+v+';')}}
// Set the "inside" HTML of an element.
function setInnerHTML(element, toValue){
	if (typeof(element.innerHTML) != 'undefined'){
		element.innerHTML = toValue;
	}else{
		var range = document.createRange();
		range.selectNodeContents(element);
		range.deleteContents();
		element.appendChild(range.createContextualFragment(toValue));
	}
}
function resolveRelativeUrl(url,relativeTo){
	if (url.match(new RegExp('^[^\./]+:[/]{2,}','g')))
		return url;
	if (url.charAt(0) == '/')
		return relativeTo.replace(new RegExp('^([^\./]+:[/]{2,}[^/]+).*','g'),'$1')+url;
	if (relativeTo.match(new RegExp('^[^\./]+:[/]{2,}[^/]+$','g')))relativeTo += '/';
	else relativeTo = relativeTo.replace(new RegExp('[^/]+$','g'),'');
	return (relativeTo+url);
}
// Set the "outer" HTML of an element.
function setOuterHTML(element, toValue)
{
	if (typeof(element.outerHTML) != 'undefined'){
		element.outerHTML = toValue;
	}else{
		var range = document.createRange();
		range.setStartBefore(element);
		element.parentNode.replaceChild(range.createContextualFragment(toValue), element);
	}
}

// Get the inner HTML of an element.
function getInnerHTML(element){
	var returnStr = '';
	for (var i = 0; i < element.childNodes.length; i++)
		returnStr += getOuterHTML(element.childNodes[i]);
	return returnStr;
}
function getInnerXUL(element){
	var returnStr = '';
		for (var i = 0; i < element.childNodes.length; i++)
			returnStr += getOuterXUL(element.childNodes.item(i));
	return returnStr;
}
function getOuterXUL(node){
	var str = '';
	switch (node.nodeType){
		// An element.
		case 1:
			str += '<' + node.nodeName;

			for (var i = 0; i < node.attributes.length; i++){
				if (node.attributes.item(i).nodeValue != null)
					str += ' ' + node.attributes.item(i).nodeName + '="' + node.attributes.item(i).nodeValue + '"';
			}
			if (node.childNodes.length == 0)str += ' />';
			else str += '>' + getInnerXUL(node) + '</' + node.nodeName + '>';
			break;
		// 2 is an attribute.

		// Just some text..
		case 3:
			str += node.nodeValue;
			break;

		// A CDATA section.
		case 4:
			str += '<![CDATA' + '[' + node.nodeValue + ']' + ']>';
			break;

		// Entity reference..
		case 5:
			str += '&' + node.nodeName + ';';
			break;

		// 6 is an actual entity, 7 is a PI.

		// Comment.
		case 8:
			str += '<!--' + node.nodeValue + '-->';
			break;
	}

	return str;
}
function getOuterHTML(node){
	if (typeof(node.outerHTML) != 'undefined')
		return node.outerHTML;
	var str = '';
	switch (node.nodeType){
		// An element.
		case 1:
			str += '<' + node.nodeName;

			for (var i = 0; i < node.attributes.length; i++)
			{
				if (node.attributes[i].nodeValue != null)
					str += ' ' + node.attributes[i].nodeName + '="' + node.attributes[i].nodeValue + '"';
			}
			function in_array(name,ar){
				for(i=0;i<ar.length;i++){if (name == ar[i])return true}
				return false;
			}
			if (node.childNodes.length == 0 && in_array(node.nodeName.toLowerCase(), ['hr', 'input', 'img', 'link', 'meta', 'br']))
				str += ' />';
			else
				str += '>' + getInnerHTML(node) + '</' + node.nodeName + '>';
			break;

		// 2 is an attribute.

		// Just some text..
		case 3:
			str += node.nodeValue;
			break;

		// A CDATA section.
		case 4:
			str += '<![CDATA' + '[' + node.nodeValue + ']' + ']>';
			break;

		// Entity reference..
		case 5:
			str += '&' + node.nodeName + ';';
			break;

		// 6 is an actual entity, 7 is a PI.

		// Comment.
		case 8:
			str += '<!--' + node.nodeValue + '-->';
			break;
	}

	return str;
}