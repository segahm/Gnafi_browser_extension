var GnafiTag = {
        	args: null,
        	mDS: null,
        	rdfService: null,
        	onAccept: function(){
  				var path = document.getElementById('gnafi_path').value;
        		var os = Components.classes["@mozilla.org/observer-service;1"]
        			.getService(Components.interfaces.nsIObserverService);
        		var obj = {
        			description: this.args.description,
        			postData: this.args.postData,
        			charset: this.args.charset,
        			url: this.args.url,
        			path: path,
        			type: this.args.islive?'feed':'url'
        		}
        		var value = '';
        		for (var i in obj){
        			value += '&'+i+'='+encodeURIComponent(obj[i]);
        		}
        		//total hack to simplify communcation with the bookmarking service
        		os.notifyObservers(null,'gnafi:talking','addbookmark:'+value);
        	},
        	putUnderToolbar: function(){
        		//make sure the user knows what we talking about
	        	var toolbar = opener.document.getElementById('PersonalToolbar');
	        	toolbar.collapsed = false;
	    		opener.document.persist("PersonalToolbar", "collapsed");
	        	var p = document.getElementById('gnafi_path');
        		var ins;
        		try{
        			var rdfService = Components.classes["@mozilla.org/rdf/rdf-service;1"]
						.getService(Components.interfaces.nsIRDFService);
        			//get <toolbar> locale name
				
					var bms = Components.classes["@mozilla.org/browser/bookmarks-service;1"]
						.getService(Components.interfaces.nsIBookmarksService);
					var resToolbarName = bms.getBookmarksToolbarFolder();
					var mBds = rdfService.GetDataSource("rdf:bookmarks");
					resToolbarName = mBds.GetTarget(resToolbarName,
						rdfService.GetResource("http://home.netscape.com/NC-rdf#Name"),true);
					resToolbarName = resToolbarName.QueryInterface(Components.interfaces.nsIRDFLiteral).Value;
					ins = resToolbarName;
				}catch(e){
					ins = '<toolbar>';
        		}
        		var v = '/'+ins+'/'+p.value.replace(new RegExp('^[^a-z]*'+ins,'gi'),'')
	        			.replace(new RegExp('^/'),'');
	        		p.value = v;
        	},
        	handleSwitchView: function(){
        		var e = opener.document.getElementById('gnafi-switchview-command');
        		var before = e.getAttribute('gnafi');
        		e.doCommand('hello');
        		var after = e.getAttribute('gnafi');
        		if (before != after)
        			document.getElementById('gnafiDialog').cancelDialog();
        	},
			init: function(){
				var strBundle = document.getElementById('gnafi-tag-stringbundle');
				this.strBundle = strBundle;
				//add switch view checkbox
				var btn = document.getElementById('gnafiDialog').getButton('extra2');
				var e = document.createElement('checkbox');
				e.setAttribute('label',strBundle.getString('tagwindow.switchview'));
				e.setAttribute('onclick','GnafiTag.handleSwitchView();');
				btn.parentNode.replaceChild(e,btn);
				
				document.getElementById('gnafiDialog').getButton('extra1').setAttribute('oncommand','GnafiTag.putUnderToolbar();');
				this.args = window.arguments[0];
				if (this.args.islive){
					document.title = strBundle.getString('tagwindow.livebookmark.title');
					var caption = strBundle.getString('tagwindow.caption.live');
					//#http://www.mozilla.com/firefox/livebookmarks.html
					var linkValue = 'http://gnafi.com/doc/faq#livelinks';
					var linkText = strBundle.getString('tagwindow.commentlink.live.value');
				}else{
					document.title = strBundle.getString('tagwindow.bookmark.title');
					var caption = strBundle.getString('tagwindow.caption');
					//http://www.mozilla.org/docs/end-user/keywords.html
					var linkValue = 'http://gnafi.com/doc/faq#keywords';
					var linkText = strBundle.getString('tagwindow.commentlink.value');
				}
				setInnerHTML(
					document.getElementById('gnafi-tag-comment')
					,strBundle.getFormattedString('tagwindow.comment',[linkValue,linkText],2)
				);
				//	.setAttribute('href','javascript:window.opener.getBrowser().loadURI("'+linkValue+'");');
				//setInnerHTML(document.getElementById('gnadi-tag-shortcutlink'),linkText);
				document.getElementById('gnafi-tag-caption').setAttribute('label',caption);
				var pathobj = document.getElementById('gnafi_path');
				var sugKeyword = '';
				var matches;
				var url = this.args.url.replace(new RegExp('^[^/]+/*'),'');
				if (!this.args.islive 
					&& (matches = url.match(new RegExp('^[^/]*[\\./]([a-z\\-]{3,}\\.)','i')))
					&& matches.length > 1)
					sugKeyword = ', '+matches[matches.length-1].substr(0,matches[matches.length-1].length-1);
				pathobj.value = ((typeof this.args.path != 'undefined')?this.args.path:'')
								+'/'+this.args.title+sugKeyword;
				pathobj.focus();
			}
}