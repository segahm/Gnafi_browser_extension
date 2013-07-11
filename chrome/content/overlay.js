/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Gnafi extension for Mozilla Firefox.
 *
 * The Initial Developer of the Original Code is 
 * Sergey Mirkin <info@gnafi.com>
 * Portions created by the Initial Developer are Copyright (C) 2005
 * the Initial Developer. All Rights Reserved.
 *
 * ***** END LICENSE BLOCK ***** */
const GNAFI_VERSION = '0.3.3';
//wrap preferences
var pGnafiBranch = Components.classes["@mozilla.org/preferences-service;1"]
	   		.getService(Components.interfaces.nsIPrefService).getBranch("extensions.gnafi.");
var GnafiBranch = {};
GnafiBranch.storage = [];
wrapInto(GnafiBranch,pGnafiBranch);
GnafiBranch.set = function(name,value){
	this.setBoolPref(name,value);
}
GnafiBranch.has = function(name){
	return this.prefHasUserValue(name);
}
GnafiBranch.get = function(name,defValue,type){
	if (!this.has(name))return defValue;
	else if (type){
		return eval('this.get'+type+'(name)');
	}else{
		return this.getBoolPref(name);
	}
}
GnafiBranch.store = function(name,value){
	GnafiBranch.storage[name] = value;
}
GnafiBranch.retrieve = function(name){
	return GnafiBranch.storage[name];
}
//main
function GnafiObserver(GnafiObj){this.GnafiObj = GnafiObj;}
GnafiObserver.prototype = {
	signedin: 'signedin',
	signedin_length: 'signedin'.length,
	observe: function(subject,topic,data){
		if (topic == 'gnafi:update-login-status'){
			if (typeof data == 'string' && data.length >= this.signedin_length 
					&& data.substr(0,this.signedin_length) == this.signedin){
				this.GnafiObj.user = data.substr(data.indexOf(':')+1);
			}else{
				this.GnafiObj.user = null;
			}
			this.GnafiObj.updateMenu();
		}
	}
}
var Gnafi = {
	user: null,
	signedin: 'signedin',
	signedin_length: 'signedin'.length,
	doc: null,
	observe: function(subject,topic,data){
		if (topic == 'gnafi:update-login-status'){
			if (typeof data == 'string' && data.length >= this.signedin_length 
					&& data.substr(0,this.signedin_length) == this.signedin){
				Gnafi.user = data.substr(data.indexOf(':')+1);
			}else{
				Gnafi.user = null;
			}
			Gnafi.updateMenu();
		}
	},
	relativePath: function(path){
		return 'http://gnafi.com'+path;
	},
	curPage: function(){
		var obj = {};
		var location, title;
      	var browser = window.getBrowser();
      	var webNav = browser.webNavigation;
      	var doc = browser.contentDocument;
      	if(webNav.currentURI)
          location = webNav.currentURI.spec;
      	else
          location = gURLBar.value;  
      
      	if(webNav.document.title)
      		title = webNav.document.title; 
      	else
       		title = location;
		obj.url = location;
      	obj.title = title;
      	obj.charset = webNav.document.characterSet
      	obj.host = obj.url.replace(new RegExp('^[^/]+/+([^/]+).*','g'),'$1');
      	return obj;
	},
	updateMenu: function(){	
		updateMenuFlag = true;	
		var strBundle = this.doc.getElementById('gnafi-stringbundle');
		if (this.user != null){
			this.doc.getElementById('gnafi-isoffline').setAttribute('disabled',false);
			this.doc.getElementById('gnafi-login-status')
				.setAttribute('label',strBundle.getString('statusSignedIn')
				+' ('+((this.user.length>10)?Gnafi.user.substr(0,10)+'...':this.user)+')');
		}else{
			this.doc.getElementById('gnafi-isoffline').setAttribute('disabled',true);
			this.doc.getElementById('gnafi-login-status').setAttribute('label',strBundle.getString('statusSignedOut'));
		}
	},
	actionPath: function(action){
		var path;
		switch(action){
			case 'mygnafi':
				path = Gnafi.relativePath("/mine");
				break;
			case 'signin':
				path = Gnafi.relativePath("/my?action=signin&small=1");
				break;
			case 'signout':
				path = Gnafi.relativePath("/my?action=signout&small=1");
				break;
			case 'sidelinks':
				var host = this.curPage().host;
				if ((typeof host) == 'undefined')host = '';
				path = Gnafi.relativePath("/search?out=sidebar&q="+encodeURIComponent('site:'+host));
				break;
			case 'search':
				path = Gnafi.relativePath("/search?q=");
				break;
			case 'redirect_search':
				path = Gnafi.relativePath("/search?r=1&q=");
				break;
			case 'welcome':
				path = Gnafi.relativePath('/doc/welcome');
				break;
			default:
				this.error('wrong action path:'+action);
		}
		return path;
	},
	handleButtonCommand: function(e,cmd){
		switch(cmd){
			case 'tag':
				this.tagThisPage();
				break;
			case 'sidebar':
				document.getElementById('gnafiSidebar')
					.setAttribute('sidebarurl',Gnafi.actionPath('sidelinks'));
				toggleSidebar('gnafiSidebar');
				break;
			case 'mybookmarks':
				document.getElementById('gnafiSidebar')
					.setAttribute('sidebarurl',Gnafi.actionPath('mysidelinks'));
				toggleSidebar('gnafiSidebar');
				break;
			case 'mygnafi':
				loadURI(Gnafi.actionPath('mygnafi'));
				break;
			case 'sync':
				//use timeout so that we don't block the user thread
				Gnafi.observer = observer;
				setTimeout("Gnafi.observer.notifyObservers(null,'gnafi:talking','sync')",0);
				break;
			case 'switchview':
				var res = true;
				if (!GnafiBranch.get('switchview.donotask',false)){
					var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
	                    .getService(Components.interfaces.nsIPromptService);
	                var checkResult = {};
	                res = promptService.confirmCheck(window,this.strBundle.getString('switchviewdialog.title'),
	  					Gnafi.strBundle.getString('switchviewdialog.comment'),
	  					Gnafi.strBundle.getString('switchviewdialog.donotrepeat'),
	  					checkResult);
	  				if (checkResult.value)
	  					GnafiBranch.set('switchview.donotask',true);
  				}
  				if (res){
	  				var v = GnafiBranch.get('usedefaultdialog',false);
					v = !v;
					GnafiBranch.set('usedefaultdialog',v);
					document.getElementById('gnafi-switchview-command')
    					.setAttribute('gnafi',v+'');
					if (v){
						BookmarksUtils.addBookmark  = Gnafi.defaultAddBookmark;
						BookmarksUtils.addLivemark = Gnafi.defaultLivemark;
					}else{
						BookmarksUtils.addLivemark = Gnafi.tagThisPage;
						BookmarksUtils.addBookmark = Gnafi.tagThisPage;
					}
					if (Gnafi.dialog)
						eval('BookmarksUtils.'+Gnafi.lastTag+';');
				}
				break;
			default:
				this.error('wrong button action:'+action);
		}
		if (e)e.stopPropagation();
	},
	goTo: function(path){
		loadURI(path);
	},
	getSelectedText: function(charlen) {
		var focusedWindow = document.commandDispatcher.focusedWindow;
		var searchStr = focusedWindow.getSelection();      
		searchStr = searchStr.toString();
		var originalSearchStrLength = searchStr.length;
		if (!charlen)charlen = 65500;
		if (charlen < searchStr.length) {
			var pattern = new RegExp("^(?:\\s*.){0," + charlen + "}");
			pattern.test(searchStr);
			searchStr = RegExp.lastMatch;
		}
		return {str:searchStr.trim(), len:originalSearchStrLength};
	},
	/*this function is not called from Gnafi skope*/
	tagThisPage: function(url,title,charset,isLiveBookmark){
		//see if there is an alternative title
		var sel = Gnafi.getSelectedText();
		description = sel.str;
		if (title.length > 255)title = title.substr(0,252)+'...'; 
		charset = charset?charset:Gnafi.curPage().charset;
		var args = {
			url: url,
			title: title.replace(new RegExp('/','g'),'\\/'),
			description: description,
			charset: charset,
			postData: '',
			islive: isLiveBookmark
		}
		var curPage = Gnafi.curPage();
		//find out if we can use the last path
		var lastpath, lasturl = GnafiBranch.get('lasttagurl','','CharPref');
		if (lasturl != '' && curPage.url == lasturl
				&& (lastpath = GnafiBranch.get('lasttagpath','','CharPref')) != ''){
			args.path = lastpath;
		}else{
			GnafiBranch.setCharPref('lasttagurl',curPage.url);
			GnafiBranch.setCharPref('lasttagpath','');
		}
		//if (isLiveBookmark)
		//	Gnafi.lastTag = 'addLivemark("'+url+'","'+title.strReplace("'","\\'")+'",null,true)';
		//else
		//	Gnafi.lastTag = 'addBookmark("'+url+'","'+title.strReplace("'","\\'")+'","'+charset.strReplace("'","\\'")+'")';
		Gnafi.dialog = true;
		window.openDialog("chrome://gnafi/content/tag.xul", 
			"tag-dialog",
			"centerscreen,chrome,modal,all,menubar=no,width=400,height=130",args);
		Gnafi.dialog = false;
		Gnafi.lastTag = null;
		
	},
	tagThisPage2: function(title,url,charset){
		Gnafi.tagThisPage(url,title,charset,true);
	},
    init: function() {
    	Gnafi.doc = document;
    	Gnafi.strBundle = document.getElementById('gnafi-stringbundle');
    	document.getElementById('gnafi-switchview-command')
    		.setAttribute('gnafi',GnafiBranch.get('usedefaultdialog','false'));
    	if(GnafiBranch.get("version",'','CharPref') != GNAFI_VERSION){ 
			function addToolbarMenu(id){
				var toolbarNode = document.getElementById('toolbar-menubar');
				if (!document.getElementById(id) && toolbarNode.insertItem(id,null,null,false)){
					toolbarNode.setAttribute("currentset",toolbarNode.currentSet); 
					document.persist(toolbarNode.id,"currentset");
				}
			}
			function addToolbarButton(id){
				var urlbarNode = document.getElementById("urlbar-container");	
				var toolbarNode = (document.getElementById('nav-bar')||urlbarNode.parentNode);
				if (!document.getElementById(id) &&  toolbarNode.insertItem(id,urlbarNode,null,false)){ 
					toolbarNode.setAttribute("currentset",toolbarNode.currentSet); 
					document.persist(toolbarNode.id,"currentset");
				}
			}
			//wait for browser services to initialize
			setTimeout('Gnafi.initBookmarks();',1000);
			addToolbarButton("gnafi-button");	//add tag button
			GnafiBranch.setCharPref("version",GNAFI_VERSION);
			Gnafi.goTo(Gnafi.actionPath('welcome'));
	   }	//end first run
	   if (GnafiBranch.get('hidemenu',false)){
	   		Gnafi.handleButtonCommand(null,'hidemenu');
	   }
	   	//login status managed by gnafi service, we just need it for display purposes
		observer = Components.classes["@mozilla.org/observer-service;1"]
        	.getService(Components.interfaces.nsIObserverService);
     	Gnafi.obs = new GnafiObserver(Gnafi);
     	observer.addObserver(Gnafi.obs, "gnafi:update-login-status", false);
		//init live link
		document.getElementById("contentAreaContextMenu").addEventListener("popupshowing",LinkPopup,true);
		//overwrite default bookmark function
		Gnafi.defaultAddBookmark = BookmarksUtils.addBookmark;
		Gnafi.defaultLivemark = BookmarksUtils.addLivemark;
		if (!GnafiBranch.get('usedefaultdialog',false)){
			BookmarksUtils.addBookmark = Gnafi.tagThisPage;
			BookmarksUtils.addLivemark = Gnafi.tagThisPage2;
		}
		this.gnSync = Components.classes['@mozilla.org/rdf/datasource;1?name=gnbookmarksync']
			.getService();
		//get current status
	    observer.notifyObservers(null,'gnafi:talking','status-check');
	   window.removeEventListener("load", Gnafi.init, false);
	},
	/*creates our default bookmark shortcuts to search*/
	initBookmarks: function(){
		var rdfService = Components.classes["@mozilla.org/rdf/rdf-service;1"]
			.getService(Components.interfaces.nsIRDFService);
		var mDS = rdfService.GetDataSourceBlocking('rdf:bookmarks');
		var bkService = Components.classes["@mozilla.org/browser/bookmarks-service;1"]
			.getService(Components.interfaces.nsIBookmarksService);
		var res = rdfService.GetResource('NC:BookmarksRoot');
		//find out the resource for Bookmarks Toolbar Folder
		var res2 = bkService.getBookmarksToolbarFolder();
		if (res2 != null){
			res = res2;
		}
						//create gnafi folder
		var pred = rdfService.GetResource('http://www.w3.org/1999/02/22-rdf-syntax-ns#nextVal');
        var nextValue = parseInt(mDS.GetTarget(res,pred,true)
        		.QueryInterface(Components.interfaces.nsIRDFLiteral).Value);
    	res = bkService.createFolderInContainer('gnafi search shortcuts',res,nextValue);
        		nextValue = parseInt(mDS.GetTarget(res,pred,true)
        		.QueryInterface(Components.interfaces.nsIRDFLiteral).Value);
    	var strBundle = Gnafi.strBundle;
    			    	//now create shortcut bookmarks
    	var desc1 = strBundle.getString('bookmarks.init.type1.description');
    	var desc2 = strBundle.getString('bookmarks.init.type2.description');	
   		var regSearch = Gnafi.actionPath('search')+'%s';
   		var regSearch2 = Gnafi.actionPath('redirect_search')+'%s';
   		var bookmarks = new Array({
   							keyword: strBundle.getString('bookmarks.init.shortcut1.keyword').valueOf(),
   							url: regSearch2,
   							title: strBundle.getString('bookmarks.init.shortcut1.title').valueOf(),
   							desc: desc1
   						},
   						{
   							keyword: strBundle.getString('bookmarks.init.shortcut2.keyword').valueOf(),
   							url: regSearch,
   							title: strBundle.getString('bookmarks.init.shortcut2.title').valueOf(),
   							desc: desc1
   						},
   						{
   							keyword: '',
   							url: Gnafi.relativePath('/doc/faq#shortcuts').valueOf(),
   							title: strBundle.getString('bookmarks.init.faq').valueOf(),
   							desc: ''
   						});
	    for (var i =0;i<bookmarks.length;i++){
	    	bkService.createBookmarkInContainer(
	    		bookmarks[i].title,
	    		bookmarks[i].url,
	    		bookmarks[i].keyword, 
	    		bookmarks[i].desc,
	    		'UTF-8',
	    		'',
	    		res,
	    		nextValue);
	    }
	},
	error: function(e){
		 const gClipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
    		.getService(Components.interfaces.nsIClipboardHelper);
  		gClipboardHelper.copyString(e);
		alert('Gnafi error:'+e);
	},
	alert: function(message,title){
		if (!gAlertsService){
			const gAlertsService = Components.classes["@mozilla.org/alerts-service;1"]
				.getService(Components.interfaces.nsIAlertsService);
		}
		gAlertsService.showAlertNotification("", 
                                    title?title:'',message, 
                                    false, "", null);
	},
	loginLogout: function(e){
		if (this.user != null){
			//observer.notifyObservers(null,'gnafi:talking','observe:cookie-changes');
			Gnafi.openSmallPopupWindow(Gnafi.actionPath('signout'));
		}else{
			//observer.notifyObservers(null,'gnafi:talking','observe:cookie-changes');
			Gnafi.openSmallPopupWindow(Gnafi.actionPath('signin'));
		}
	},
	openSmallPopupWindow : function(aPath){
      //make it center	
      var width = 700, height = 400;
      var left = parseInt((screen.availWidth/2) - (width/2)); 
      var top  = parseInt((screen.availHeight/2) - (height/2));
      
      var props = "width="+width+",height="+height+",left="+left+",top="+top+",scrollbars=yes,menubar=0,toolbar=0,location=0,status=0,resizable=yes";
      var win = window.open(aPath, "", props);
   },
   setAndUnselect: function(id,value){
   	var field = document.getElementById(id);
   	field.value = value;
   	field.focus();
	field.setSelectionRange(value.length,value.length);
   }
}
window.addEventListener("load", Gnafi.init, false);