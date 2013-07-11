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
const MYDEBUG = false;
const KEEP_LOG = false;
/*************************************************************************************************
***************************************** START OF gnSyncBookmarks *******************************
**************************************************************************************************/
function gnSyncBookmarks(){
	this.startTimeout = null;	//startup timer
	const http_domain = 'gnafi.com';
	const http_syncPost = 'http://'+http_domain+'/sync?cvsid=';	//url we use for syncronization (via post)
	const http_pushurl = 'http://'+http_domain+'/mine?act=savenew';
	const gnSync = this;
	const gnRdf = 'http://gnafi#';
	const nsRdf = 'http://home.netscape.com/NC-rdf#';
	const nsWebRdf = 'http://home.netscape.com/WEB-rdf#';
	const rdfRdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
	const wordnetRdf = "http://xmlns.com/wordnet/1.6/";
	
	const mRdfService = Components.classes["@mozilla.org/rdf/rdf-service;1"]
		.getService(Components.interfaces.nsIRDFService);
	const mContUtils = Components.classes["@mozilla.org/rdf/container-utils;1"]
		.getService(Components.interfaces.nsIRDFContainerUtils);
	const bms = Components.classes["@mozilla.org/browser/bookmarks-service;1"]
			.getService(Components.interfaces.nsIBookmarksService);
	//init often used resources
	var defResources = [
				['gnRdf_res',gnRdf+'res'],
				['gnRdf_url',gnRdf+'url'],
				['gnRdf_root','gnafi:root'],
				['nsRdf_Name',nsRdf+'Name'],
				['rdfRdf_type',rdfRdf+'type'],
				['rdfRdf_instanceOf',rdfRdf+'instanceOf'],
				['nsRdf_Livemark',nsRdf+'Livemark'],
				['nsRdf_URL',nsRdf+'URL'],
				['nsRdf_FeedURL',nsRdf+'FeedURL'],
				['nsRdf_LastModifiedDate',nsWebRdf+'LastModifiedDate'],
				['nsRdf_BookmarkAddDate',nsRdf+'BookmarkAddDate'],
				['nsRdf_LastVisitDate',nsWebRdf+'LastVisitDate'],
				['nsRdf_Description',nsRdf+'Description'],
				['nsRdf_LastCharset',nsWebRdf+'LastCharset'],
				['nsRdf_LivemarkExpiration',nsRdf+'LivemarkExpiration'],
				['nsRdf_ShortcutURL',nsRdf+'ShortcutURL'],
				['nsRdf_Type',nsRdf+'Type'],//invented
				['nsRdf_root','NC:BookmarksRoot']
		];
	for (var i =0;i<defResources.length;i++){
		eval('const '+defResources[i][0]+'= mRdfService.GetResource(defResources[i][1]);');
	}
	defResources = null;
	const mBds = mRdfService.GetDataSource("rdf:bookmarks");
	const root = mRdfService.GetResource('gnafi:root');
	var http_request = null;
	var initedWebServices = false;
	var synctimeout = null;
	var observerService = null;
	var resToolbarName;
	var GnafiUser;
	//class initializer
	this.init = function(){
		dmp('init');
		observerService = Components.classes["@mozilla.org/observer-service;1"]
	    	.getService(Components.interfaces.nsIObserverService);
	    //this is how we talk to user interface (simple and easy)
	    observerService.addObserver(this,'gnafi:talking',false);
	    this.observeCookieChanges(true);
	    GnafiUser = new GnafiUserFunc();
		if (!GnafiUser.isSignedIn(null,true)){
			observerService.notifyObservers(null,'gnafi:update-login-status','signedout');
    	}else{
    		observerService.notifyObservers(null,'gnafi:update-login-status','signedin:'+GnafiUser.username);
    		this.runWebServices();
		}
	};
	this.observeCookieChanges = function(boolVal){
    	try{
			observerService.removeObserver(this,"cookie-changed");
		}catch(e){}
		if (boolVal){
			dmp('watching cookie changes');
			observerService.addObserver(this,"cookie-changed",false);
		}else{
			dmp('stopped watching cookie changes');
		}
    };
	this.notify = function(timer){
		this.runWebServices();	
	}
	//sink methods
	this.onBeginLoad = function(sink){
	}
	this.onInterrupt = function(sink){
	}
	this.onResume = function(sink){
	}
	this.onError = function(sink,status,msg){
		throw new Error(msg)
	}
    //inits sync settings, and decides wherever to call "link push","major sync",or nothing
    this.runWebServices = function(forceSync){
    	dmp('running web services');
    	if ((typeof forceSync) == 'undefined')
    		var forceSync = false;
    	if (!initedWebServices){
    		initedWebServices = true;
	    	lastTimeSync = GnafiBranch.get('lastsync','','CharPref');
	    	if (lastTimeSync == ''){
	    		forceSync = true;
	    		lastTimeSync = new Date();
	    	}else{
	    		try{
	    			lastTimeSync = new Date(lastTimeSync);
	    		}catch(e){
	    			dmp('exception:lastTimeSync = new Date(lastTime);:'+e.message);
	    			forceSync = true;
	    			lastTimeSync = new Date();
	    		}
	    	}
	    	syncInterval = GnafiBranch.get('syncinterval_hour',24,'IntPref');
    	}
    	//if cvsid hasn't previously been created, then this is our firsttime
    	var cvsid = GnafiBranch.get('cvsid.'+GnafiUser.username,'','CharPref');
	    if (cvsid.length != 5){
	    	dmp('do sync');
	    	forceSync = true;
	    	cvsid = genRandStr(5);
	    	GnafiBranch.setCharPref('cvsid.'+GnafiUser.username,cvsid);
	    }
    	var diff = (new Date()-lastTimeSync)/(1000*60*60);	//in hours
    	if (forceSync || (diff >= syncInterval)){
    		dmp('calling sync')
    		this.synchronize(forceSync,cvsid);
    	}
    	if (synctimeout == null){
	    	synctimeout = Components.classes['@mozilla.org/timer;1']
	    			.createInstance(Components.interfaces.nsITimer);
	    	//wait and do this again - this is not normally needed, but is here
	    	//in case browser instance remains live for long
	    	synctimeout.initWithCallback(this,1000*60*60*syncInterval,Components.interfaces.nsITimer.TYPE_REPEATING_SLACK);
    	}
    }
    function doBookmarksCommand(aSource, aCommand, aArgumentsArray){
		var rCommand = mRdfService.GetResource('http://home.netscape.com/NC-rdf#command?cmd='+aCommand);
		var kSuppArrayContractID = "@mozilla.org/supports-array;1";
		var kSuppArrayIID = Components.interfaces.nsISupportsArray;
		var sourcesArray = Components.classes[kSuppArrayContractID].createInstance(kSuppArrayIID);
		if (aSource){
			sourcesArray.AppendElement(aSource);
		}
		var argsArray = Components.classes[kSuppArrayContractID].createInstance(kSuppArrayIID);
		var length = aArgumentsArray?aArgumentsArray.length:0;
		for (var i = 0; i < length; i++){
			var rArc = aArgumentsArray[i].property;
			argsArray.AppendElement(rArc);
			var rValue = null;
			if ("resource" in aArgumentsArray[i])
			   rValue = mRdfService.GetResource(aArgumentsArray[i].resource);
			else
			    rValue = mRdfService.GetLiteral(aArgumentsArray[i].literal);
			argsArray.AppendElement(rValue);
		}
		// Exec the command in the Bookmarks datasource. 
		mBds.DoCommand(sourcesArray, rCommand, argsArray);
	}
    function synchronizeFromRdfString(docStr){
	    try{
	    	dmp('synchronize FromRdf String');
	    	//first, backup bookmarks
	    	var file = Components.classes["@mozilla.org/file/directory_service;1"]
				.getService(Components.interfaces.nsIProperties)
				.get("ProfD", Components.interfaces.nsIFile)
			file.append("bookmarks_gnafi.html");
	    	var rTarget = mRdfService.GetResource("NC:BookmarksTopRoot");	//is this really needed?
	    	var args = [{ property: nsRdf_URL, literal: file.path}];
	    	doBookmarksCommand(rTarget,"export", args);
	    	if (MYDEBUG){
		  		file = Components.classes["@mozilla.org/file/directory_service;1"]
					.getService(Components.interfaces.nsIProperties)
					.get("ProfD", Components.interfaces.nsIFile)
				file.append("gnafi_import.html");
		  		var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
	                         .createInstance(Components.interfaces.nsIFileOutputStream);
				// use 0x02 | 0x10 to open file for appending.
				foStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0); // write, create, truncate
				foStream.write(docStr, docStr.length);
				foStream.close();
			}
	  		const memDS = Components.classes["@mozilla.org/rdf/datasource;1?name=in-memory-datasource"]
                   .createInstance(Components.interfaces.nsIRDFDataSource);
            var ios=Components.classes["@mozilla.org/network/io-service;1"]
                  .getService(Components.interfaces.nsIIOService);
  			baseUri=ios.newURI(gnRdf+'TempURI',null,null);
  			var parser=Components.classes["@mozilla.org/rdf/xml-parser;1"]
                       .createInstance(Components.interfaces.nsIRDFXMLParser);
            parser.parseString(memDS,baseUri,docStr);
            var container = Components.classes["@mozilla.org/rdf/container;1"]
    					.createInstance(Components.interfaces.nsIRDFContainer);
    		const removeRoot = mRdfService.GetResource(gnRdf+'Removed');
    		const appendRoot = mRdfService.GetResource('NC:BookmarksRoot');
    		const nsIRDFResource = Components.interfaces.nsIRDFResource;
	  		const nsIRDFLiteral = Components.interfaces.nsIRDFLiteral;
    		var proceedWithAction = true;
    		try{
    			container.Init(memDS,appendRoot);
    			dmp('proceeding with appending');
    		}catch(e){
    			proceedWithAction = false;
    		}
    		if (proceedWithAction){
    			function iterateThroughFolder(cont,bCont){
    				dmp(cont.Resource.Value+','+bCont.Resource.Value);
    				var enum = cont.GetElements();
    				var myCont = Components.classes["@mozilla.org/rdf/container;1"]
    								.createInstance(Components.interfaces.nsIRDFContainer);
    				while(enum.hasMoreElements()){
    					var el = enum.getNext().QueryInterface(nsIRDFResource);
    					//if folder
    					if (mContUtils.IsContainer(memDS,el)){
    						myCont.Init(memDS,el);
    						var folderCont;
    						try{
    							folderCont = Components.classes["@mozilla.org/rdf/container;1"]
    								.createInstance(Components.interfaces.nsIRDFContainer);
    							folderCont.Init(mBds,el);
    						}catch(e){
    							//create this folder
    							var name = memDS.GetTarget(el,nsRdf_Name,true).QueryInterface(nsIRDFLiteral).Value;
    							el = bms.createFolderInContainer(name,bCont.Resource,-1);
    							folderCont.Init(mBds,el);
    						}
    						iterateThroughFolder(myCont,folderCont);
    					}else{
    						bCont.AppendElement(el);
    						dmp('copying '+el.Value+' from '+memDS.URI+' to '+mBds.URI);
    						copyProperties(el,el,memDS,mBds);
    					}
    				}
    			}
    			var conRoot = Components.classes["@mozilla.org/rdf/container;1"]
    					.createInstance(Components.interfaces.nsIRDFContainer);
    			conRoot.Init(mBds,appendRoot);
    			iterateThroughFolder(container,conRoot);
    		}
    		//do remove
    		proceedWithAction = true;
    		try{
    			container.Init(memDS,removeRoot);
    			dmp('proceeding with removale');
    		}catch(e){
    			proceedWithAction = false;
    		}
    		var foldersTouched = [];
    		if (proceedWithAction){
    			var enum = container.GetElements();
    			var lastParent = null;
    			var i = 0;
    			while(enum.hasMoreElements()){
    				var resLit = enum.getNext().QueryInterface(nsIRDFLiteral);
    				var res = mRdfService.GetResource(resLit.Value);
    				var parent = unlink(res,mBds);
    				if (parent != null && (lastParent == null || lastParent.Value != parent.Value)){
	    				lastParent = parent;
	    				foldersTouched.push(parent);	//so that we can then delete empty folders
	    			}
	    			++i;
    			}
    			dmp('removed '+i+' entries');
    		}
    		const CheckedEntry = mRdfService.GetResource(gnRdf+'CheckedResource');
    		const trueValue = mRdfService.GetLiteral('t');
    		const falseValue = mRdfService.GetLiteral('f');
	  		function isRecursiveEmpty(thisfolder){
	  			dmp('isRecursiveEmpty on '+thisfolder.Value);
	  			//if we have previously checked this resource, then get the result now
	  			var r = memDS.GetTarget(CheckedEntry,thisfolder,true);
	  			if (r != null){
	  				return (r.QueryInterface(nsIRDFLiteral).Value == 't');
	  			}
	  			//else perhaps it includes other folders, so check if they are empty
	  			var container = Components.classes["@mozilla.org/rdf/container;1"]
    					.createInstance(Components.interfaces.nsIRDFContainer);
	  			try{
	  				container.Init(mBds,thisfolder);
	  			}catch(e){
	  				if (mBds.hasArcOut(thisfolder,nsRdf_URL) || mBds.hasArcOut(thisfolder,nsRdf_FeedURL)){
	  					memDS.Assert(CheckedEntry,thisfolder,falseValue,true);
	  					return false;	//this is a link, the parent folder is not empty
	  				}else{
	  					memDS.Assert(CheckedEntry,thisfolder,trueValue,true);
	  					return true;	//if this is not a link
	  				}
	  			}
	  			var enum = container.GetElements();
	  			isEmpty = true;
	  			var child = null;
	  			//iterate while folder is empty
	  			while(isEmpty && enum.hasMoreElements()){
	  				child = enum.getNext().QueryInterface(nsIRDFResource);
	  				isEmpty = isRecursiveEmpty(child);
	  			}
	  			//empty, if there were no elements, or all are empty
	  			if (child == null || isEmpty){
	  				memDS.Assert(CheckedEntry,thisfolder,trueValue,true);
	  				return true;
	  			}else{
	  				memDS.Assert(CheckedEntry,thisfolder,falseValue,true);
	  				return false;
	  			}
	  		}
	  		//remove empty folders if such exist after synchronization
	  		var folder;
	  		const myTempRdf = mRdfService.GetLiteral(gnRdf+'Temp1');
	  		while ((folder = foldersTouched.pop()) 
	  				&& !mBds.HasAssertion(folder,rdfRdf_instanceOf,myTempRdf,true)){	//we don't wanna check deleted folders
	  			var isEmpty = isRecursiveEmpty(folder);
	  			if (isEmpty){
	  				dmp('removing folder');
	  				//first make sure we don't initialize it as a container in the future
	  				mBds.Assert(folder,rdfRdf_instanceOf,myTempRdf,true);
	  				mBds.Assert(folder,rdfRdf_type,myTempRdf,true);
		  			//unlink from parent and get a new parent that we will need to check
		  			folder = unlink(folder,memDS);	//if parent is a valid folder, then add it to the list
		  			if (folder != null && folder.Value != 'NC:BookmarksRoot'){
		  				foldersTouched.push(folder)
		  			}
	  			}
	  		}
	  	}catch(e){
	  		var gClipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
    		.getService(Components.interfaces.nsIClipboardHelper);
  			gClipboardHelper.copyString(e.lineNumber+':'+e.message);
  			throw e;
	  	}
    }
    var currentlySyncing = false;
    this.synchronize = function(firstTimeEver,cvsid){
    	if (currentlySyncing)return;
    	currentlySyncing = true;
    	//do a check on time to make sure that some time has passed and this is not a result of clicking multiple times
    	var diff = (new Date() - lastTimeSync)/(1000*60);	//in minutes
    	//unless of course this is the first time
    	if (!firstTimeEver && diff<5)return;
    	dmp('synchronize, diff:'+diff);
    	var obj = {};
    	serializeBookmarksRdf(obj);
    	if (MYDEBUG){
	    	var file = Components.classes["@mozilla.org/file/directory_service;1"]
				       		.getService(Components.interfaces.nsIProperties)
				            .get("ProfD", Components.interfaces.nsIFile)
			file.append("gnafi_output.dat");
	    	var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
	                         .createInstance(Components.interfaces.nsIFileOutputStream);
	
			// use 0x02 | 0x10 to open file for appending.
			foStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0); // write, create, truncate
			foStream.write(obj.value, obj.value.length);
			foStream.close();
		}
    	if (http_request == null){
			http_request = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
    		if (http_request.overrideMimeType)
				http_request.overrideMimeType('text/xml');
		}
		http_request.onreadystatechange = function(){
			if (http_request.readyState == 4){
				dmp('http_request.onreadystatechange');
				var statusTest = -1;
				try{
					statusTest =  http_request.status;
				}catch(e){
				}
				if (statusTest == 200) {
					dmp('calling: synchronizeFromRdfString');
					try{
						synchronizeFromRdfString(http_request.responseText);
						lastTimeSync = new Date();
    					GnafiBranch.setCharPref('lastsync',lastTimeSync.toString());
    					alert('in-sync!','Gnafi',true);
					}catch(e){
						alert('unknown error!','Gnafi',true);
					}
				}else if (statusTest == 403){
					alert('failed to authenticate!','Gnafi',true);
					dmp('are we still loggedin?');
					//check wherever cookies were invalidated
					observerService.notifyObservers(null,'gnafi:talking','cookie-invalidated');
				}else{
					//statusTest == 400 - server parsing problems
					dmp('sync status:'+statusTest);
					alert('unknown connection error!','Gnafi',true);
				}
				currentlySyncing = false;
			}
		};
		http_request.open('POST', http_syncPost+cvsid, true);	//async
		http_request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
		http_request.send('text='+encodeURIComponent(obj.value));
    }
    //observer
    this.observe = function(subject,topic,data){
    	switch(topic){
    		case 'cookie-changed':
    			if (!GnafiUser.isSignedIn()){
	    			if (data.startsWith(['added','changed'])
	    					&& GnafiUser.isSignedIn(subject.QueryInterface(Components.interfaces.nsICookie2))){
		    			observerService.notifyObservers(null,'gnafi:talking','status-check');
		    			//we are not going to keep track of the login status, instead we will attempt
		    			//to determine when the user signs off when an error occurs in a transaction
		    			this.runWebServices();
	    			}
    			}else{
    				//if either we were listening, and found out that cookie was deleted
    				//or we've discovered that we can no longer connect to the server and thus
    				//a possibly have an invalid login data
    				var which = data.startsWith(['deleted','changed','cleared']);
    				var flag = false;
    				switch(which){
    					case 1:
    						//if our current cookie was deleted
    						subject.QueryInterface(Components.interfaces.nsICookie2);
    						if (GnafiUser.isOurCurrentCookie(subject))flag = true;
    						break;
    					case 2:
    						//if our cookie expired
    						subject.QueryInterface(Components.interfaces.nsICookie2);
    						if (GnafiUser.isExpired(subject))flag = true;
    						break;
    					case 3:
    						flag = true;
    						break;
    				} 
    				if (flag){
						dmp('clearing listeners');
						initedWebServices = false;
						GnafiUser.invalidate();
						try{
							synctimeout.cancel();
						}catch(e){
						}
						synctimeout = null;
						observerService.notifyObservers(null,'gnafi:talking','status-check');
	    			}
    			}
    			break;
    		case 'gnafi:talking':
    			var which = data.startsWith(['observe:cookie-changes','sync','addbookmark:','status-check','cookie-invalidated']);
    			switch(which){
    				//if we need to start watching for a possible login change
    				case 1:
    					this.observeCookieChanges(true);
    					break;
    				case 2:
    					//doSync == true
    					this.runWebServices(true);
    					break;
    				case 3:
    					//total hack...
    					createBookmark(data.substr(data.indexOf(':')+1));
    					break;
    				case 4:
    					if (GnafiUser.username != null)
    						observerService.notifyObservers(null,'gnafi:update-login-status','signedin:'+GnafiUser.username);
    					else
    						observerService.notifyObservers(null,'gnafi:update-login-status','signedout');
    					break;
    				case 5:
						var cookieManager = Components.classes["@mozilla.org/cookiemanager;1"]
							.getService(Components.interfaces.nsICookieManager);
						GnafiUser.invalidate();
						cookieManager.remove('gnafi.com','cookie[username]','/',false);
						observerService.notifyObservers(null,'gnafi:talking','status-check');
    			}
    			break;
    		case 'timer-callback':
    			this.startTimeout = null;
    			this.init();
    			break;
    		default:
    			throw new Error('Observer topic not supported!');
    	}
    }
    function getParent(res,ds,object){
    	var enum = ds.ArcLabelsIn(res);
    	while(enum.hasMoreElements()){
    		var pred = enum.getNext().QueryInterface(Components.interfaces.nsIRDFResource);
    		if (pred.Value.startsWith(rdfRdf+'_')){
	    		var source = ds.GetSource(pred,res,true);
	    		if (typeof object != 'undefined')object.pred = pred;
	    		return source.QueryInterface(Components.interfaces.nsIRDFResource);
    		}
    	}
    }
    function copyProperties(res,toRes,ds,toDb){
    	dmp('copying');
    	var enum = ds.ArcLabelsOut(res);
    	var i =0;
    	while(enum.hasMoreElements()){
    		var prop = enum.getNext().QueryInterface(Components.interfaces.nsIRDFResource);
    		dmp('copying property:'+prop.Value);
    		var target = ds.GetTarget(res,prop,true);
    		toDb.Assert(toRes,prop,target,true);
    		++i;
    	}
    	return i;
    }
    function unlink(res,ds){
    	//unlink from parent
    	var obj = {};
    	var source = getParent(res,ds,obj);
    	if (source != null)
    		ds.Unassert(source,obj.pred,res);
    	return source;
    }
    /*removes all children and parent connections; if deep == true, then children trees will also
     * be removed; NOTE: that if deep == true and children trees contain circular references, then
     * an unpleasant result will happen*/
    function removeRes(res,deep,ds){
    	if ((typeof ds) == 'undefined')ds = myDs;
    	if ((typeof deep) == 'undefined')deep = false;
    	var enum = ds.ArcLabelsOut(res);
    	//unlink properties
    	while(enum.hasMoreElements()){
    		var pred = enum.getNext().QueryInterface(Components.interfaces.nsIRDFResource);
    		var target = ds.GetTarget(res,pred,true);
    		ds.Unassert(res,pred,target);
    		if (deep && (target instanceof Components.interfaces.nsIRDFResource))
    			removeRes(target.QueryInterface(Components.interfaces.nsIRDFResource),deep,ds);
    	}
    	//unlink from parent
    	var enum = ds.ArcLabelsIn(res);
    	while(enum.hasMoreElements()){
    		var pred = enum.getNext().QueryInterface(Components.interfaces.nsIRDFResource);
    		var source = ds.GetSource(pred,res,true);
    		ds.Unassert(source,pred,res);
    	}
    }
    function isTypeFeed(res){
    	return mBds.HasAssertion(res,rdfRdf_type,nsRdf_Livemark,true);
    }
    function alert(message,title){   
			var gAlertsService = Components.classes["@mozilla.org/alerts-service;1"]
					.getService(Components.interfaces.nsIAlertsService);
			gAlertsService.showAlertNotification("chrome://gnafi/skin/icon24.png", 
	                                    title?title:'',message, 
	                                    false, "", null);
	}
	const uriRe = new RegExp('[^:]+:[^@]+@[^\.]\..+','g');
	//looks if the uri might be private (i.e. username:password@domain.com) and thus shouldn't be synchronized
	function isPrivateUri(uri){
		//we don't synchronize private urls at the moment
		return (uri.search(uriRe) != -1);
	}
	//NOTE: we cannot simply use datasource GetSource method to determine the parent
	//because we treat folder names as type-soft
	function createBookmark(encStr,object){
		if (typeof object == 'undefined'){
			var els = encStr.split('&');
			var path, object = {
				type: null,
				description: '',
				charset: 'UTF-8',
				postData: ''};
			for (var i=0;i<els.length;i++){
				var el = els[i].split('=',2);
				if (el.length != 2)continue;
				object[el[0]] = decodeURIComponent(el[1]);
			}
		}
		const nsIEntityConverter = Components.interfaces.nsIEntityConverter;
		const entityConverter = Components.classes['@mozilla.org/intl/entityconverter;1']
    		.createInstance(Components.interfaces.nsIEntityConverter);
		path = object.path;
        var path = path.replace(new RegExp('^/+'),'').replace(new RegExp('([^\\\\])/{2,}','g'),'$1/')
        			.replace(new RegExp('([^\\\\])/$'),'$1').replace(new RegExp('\\\\/','g'),'gnafi_gnafi')
        			.split(new RegExp('[ ]*/[ ]*','g'));
   		var res = mRdfService.GetResource("NC:BookmarksRoot");
        //special path directive telling us to start from the toolbar folder
        if (path[0] == '<toolbar>'){
        	res = bms.getBookmarksToolbarFolder();
        	path.shift();
        }
   		const classContainer = '@mozilla.org/rdf/container;1';
   		const nsIRDFContainer = Components.interfaces.nsIRDFContainer;
   		const nsIRDFLiteral = Components.interfaces.nsIRDFLiteral;
   		const nsIRDFResource = Components.interfaces.nsIRDFResource;
   		var le = path.length-1;
   		var re1 = new RegExp('[ ]{2,}','g');
   		var pathCopy = path.join('/').toLowerCase().replace(re1,' ').split('/');
   		var catLevel;
   		var pathStr = '';
   		for(var i =0;i<pathCopy.length;i++){
   			pathCopy[i] = pathCopy[i].replace(/gnafi_gnafi/g,'/');
   		}
   		for (catLevel = 0;catLevel<le;catLevel++){
			var cnt = Components.classes[classContainer]
		   		.createInstance(nsIRDFContainer);
		   	cnt.Init(mBds,res);
		   	var children = cnt.GetElements();
		   	var foundCat = false;
		   	while(children.hasMoreElements()){
		   		var child = children.getNext();
		    	//if it's not a folder continue
		    	if (!mContUtils.IsContainer(mBds,child))continue;
		    	//make sure it's not a feedurl
		    	if (mBds.hasArcOut(child,nsRdf_FeedURL))continue;
				var name = '';
				try{
					//get it's name
					var target = mBds.GetTarget(child,nsRdf_Name,true)
										.QueryInterface(nsIRDFLiteral);
					    			
					name = target.Value;
				}catch(e){
					continue;
				}
				//make the names flexible
				if (name.trim().toLowerCase().replace(re1,' ') == pathCopy[catLevel]){
					 foundCat = true;
					 res = child;
					 break;
				}
		 	}
		 	var replacedOriginal = path[catLevel].replace(/gnafi_gnafi/g,'/');
		 	pathStr += '/'+replacedOriginal;
		    //create a new category if one wasn't found
		 	if (!foundCat){
		    	res = bms.createFolderInContainer(replacedOriginal,res,-1);
		 	}
		}
		GnafiBranch.setCharPref('lasttagpath',pathStr);
		var result = null;
		if (object.type == 'folder')return;
		//now add link to the last category
		var keywords = null;
		if (object.type == 'feed'){
			var title = path[path.length-1].replace(/gnafi_gnafi/g,'/');
			title = entityConverter.ConvertToEntities(title,nsIEntityConverter.html40);
		    result = bms.createLivemarkInContainer(title,object.url,object.url, 
				object.description,res,-1)	
		}else{
			keywords = path[path.length-1].replace(/gnafi_gnafi/g,'/').split(/[ ]*,[ ]*/);
			var title = keywords.shift();
			title = entityConverter.ConvertToEntities(title,nsIEntityConverter.html40);
			keywords = keywords.join(',');
			result = bms.createBookmarkInContainer(title,object.url,keywords, 
			  		object.description,object.charset,object.postData,res ,-1)	
		}
		if (!GnafiUser.isSignedIn(null,true))return;
		/**************/
		//push a link to our datasource
		//now we need to get the actual path and since our comparison was done in a ci manner
		//we need to query the actual rdf for this info to get the actual path
		var chain = bms.getParentChain(result);
		var l = chain.length;
		dmp('length path:'+l);
		var path = '';
		var obj = {};
		var flag = false;
		//find out bookmarks toolbar folder name in this locale
		if (!resToolbarName){
			resToolbarName = bms.getBookmarksToolbarFolder();
			resToolbarName = mBds.GetTarget(resToolbarName,nsRdf_Name,true);
			resToolbarName = resToolbarName.QueryInterface(Components.interfaces.nsIRDFLiteral).Value;
		}
		for (var i=2;i<l;i++){
			if (flag)path += '/';
			var r = chain.queryElementAt(i,nsIRDFResource,obj);
			var v = mBds.GetTarget(r,nsRdf_Name,true).QueryInterface(nsIRDFLiteral).Value;
			if (v == resToolbarName)continue;	//we do not want to store toolbar folder's name
			//remove special symbols
			v = entityConverter.ConvertToEntities(v,nsIEntityConverter.html40);
			path += v;
			dmp('attaching p:'+v);
			flag = true;
		}
		var fields = {tags:path+((keywords != null)?","+keywords:""),	//includes both path & tags
					link:object.url,
					title:title,
					description:'',	//description is always empty
					isfeed:((object.type == 'feed')?'f':'u')}
		if (http_request == null){
			http_request = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
    		if (http_request.overrideMimeType)
				http_request.overrideMimeType('text/plain');
		}
		http_request.onreadystatechange = function(){
			if (http_request.readyState == 4){
				var statusTest = -1;
				try{
					statusTest =  http_request.status;
				}catch(e){
				}
				if (statusTest == 403){
					dmp('are we still loggedin?');
					//check wherever cookies were invalidated
					observerService.notifyObservers(null,'gnafi:talking','cookie-invalidated');
				}
			}
		};
		var str = '';
		for(var i in fields){
			fields[i] = fields[i].trim();
			str += '&'+i+'='+encodeURIComponent(fields[i]);
		}
		http_request.open('POST',http_pushurl, true);	//async
		http_request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
		http_request.send(str);
	}
	//for some unknown reason, we can't serialize rdf:bookmarks datasource, so this is a workaround
	function serializeBookmarksRdf(object){
		//dom constants
		const nsIDOMDocument = Components.interfaces.nsIDOMDocument;
		//rdf constants
		const nsIRDFDate = Components.interfaces.nsIRDFDate;
    	const nsIRDFLiteral = Components.interfaces.nsIRDFLiteral;
    	const nsIRDFResource = Components.interfaces.nsIRDFResource;
    	const nsIEntityConverter = Components.interfaces.nsIEntityConverter;
    	//property constants
    	const nsName = 'Name';
    	const rdfSeq = 'Seq';
    	const rdfli = 'li';
    	const rdfabout = 'about';
    	const nsNameSpace = 'NC';
    	const rdfNameSpace = 'RDF';
    	//bookmark properties we are interested in
		const ImportantProperties = 
				['LastVisitDate','BookmarkAddDate','LastModifiedDate','LastCharset',
				'Description','FeedURL','Name','ShortcutURL','URL'];
												
		var dom = Components.classes['@mozilla.org/xul/xul-document;1']
			.createInstance(nsIDOMDocument);
		var parent  = dom.createElement(rdfNameSpace+':RDF');
        parent = dom.appendChild(parent);
        //just in case if we later decide to use name spaces
	 	parent.setAttribute('xmlns:'+rdfNameSpace,rdfRdf);	//default namespace
        parent.setAttribute('xmlns:'+nsNameSpace,nsRdf); 	
    	const entityConverter = Components.classes['@mozilla.org/intl/entityconverter;1']
    		.createInstance(Components.interfaces.nsIEntityConverter);
    		
    	exportFolder(nsRdf_root,true,parent);
    	const xmlSerializer = Components.classes['@mozilla.org/xmlextras/xmlserializer;1']
    		.createInstance(Components.interfaces.nsIDOMSerializer);
    	object.value = '<?xml version="1.0"?>'+xmlSerializer.serializeToString(dom);
    	
    	function exportMark(res,url,isFeed,parentli){
    		var parent = dom.createElement(rdfNameSpace+':'+rdfli);
    		parentli.appendChild(parent);
    		parent.setAttribute('id',res.Value);
    		var arcs = mBds.ArcLabelsOut(res);
    		//iterate through links properties
    		while(arcs.hasMoreElements()){
    			var next = arcs.getNext().QueryInterface(nsIRDFResource);
    			var prop = next.Value;
    			var which;
    			var doEnc = false;
    			if (!(which = prop.endsWith(ImportantProperties)))
    					continue;
    			var target = mBds.GetTarget(res,next,true);
    			var val;
    			//is date?
    			try{
	    			if (which  < 4){
	    				var v = target.QueryInterface(nsIRDFDate).Value;
	    				val = Math.floor(parseInt(v)/1000000);//result = timestamp in seconds
	    			}else{
	    				val = target.QueryInterface(nsIRDFLiteral).Value;
	    				//1st remove all special symbols (they shouldn't be here anyways)
	    				val = entityConverter.ConvertToEntities(val,nsIEntityConverter.html40);
	    			}
	    			var e = dom.createElement(nsNameSpace+':'+ImportantProperties[which-1]);
	    			e = parent.appendChild(e);
	    			var v = dom.createTextNode(val);
	    			e.appendChild(v);
	    		}catch(e){
	    			dmp('failed setting property:'+prop+' for:'+res.Value);
	    		}
    		}
    	}
    	function exportFolder(res,isRoot,parent){
    		var name = null;
    		if (!isRoot){
    			name = mBds.GetTarget(res,nsRdf_Name,true);
				if (name == null)	//this is not a folder (probably a separator)
					return;
				name = name.QueryInterface(nsIRDFLiteral).Value;
	    		//remove special symbols (i.e. copyright signs...)
	    		name = entityConverter.ConvertToEntities(name,nsIEntityConverter.html40);
    		}
    		var e = dom.createElement(rdfNameSpace+':'+rdfSeq);
    		e = parent.appendChild(e);
    		e.setAttribute(rdfNameSpace+':'+rdfabout,res.Value);
    		if (name){
    			e.setAttribute(rdfNameSpace+':'+nsName,name);
    		}
    		parent = e;
    		var cnt = Components.classes['@mozilla.org/rdf/container;1']
    				.createInstance(Components.interfaces.nsIRDFContainer);
    		cnt.Init(mBds,res);
    		var enum = cnt.GetElements();
    		//this is not exactly a valid rdf file, but it simplifies a couple of things :)
    		while(enum.hasMoreElements()){
    			var el = enum.getNext()
    			el.QueryInterface(Components.interfaces.nsIRDFResource);
    			if ((target = mBds.GetTarget(el,nsRdf_FeedURL,true)) != null){
    				exportMark(el,target.QueryInterface(nsIRDFLiteral).Value,true,parent);
    			}else if((target = mBds.GetTarget(el,nsRdf_URL,true)) != null){
    				exportMark(el,target.QueryInterface(nsIRDFLiteral).Value,false,parent);
    			}else{
    				//folders are never inserted into li tags, so that we can easily gather all links using li tag
    				exportFolder(el,false,parent);
    			}
    		}
    	}
    }
}
gnSyncBookmarks.prototype.QueryInterface = function (iid) {
	if (!iid.equals(Components.interfaces.nsISupports)
        		&& !iid.equals(Components.interfaces.nsIObserver)
            	&& !iid.equals(Components.interfaces.nsITimerCallback)
            	&& !iid.equals(Components.interfaces.nsIRDFXMLSinkObserver)){
            throw Components.results.NS_ERROR_NO_INTERFACE;
    }
    return this;
}
/*************************************************************************************************
***************************************** END OF gnSyncBookmarks *********************************
**************************************************************************************************/
/*************************************************************************************************
**************************************************************************************************
**************************************************************************************************
**************************************************************************************************
**************************************************************************************************
**************************************************************************************************
**************************************************************************************************
**************************************************************************************************
**************************************************************************************************
**************************************************************************************************
**************************************************************************************************
**************************************************************************************************
**************************************************************************************************/
/**************************************** START OF gnKeywordSearch *******************************/
/*
function gnKeywordSearch(){
	var rdfService, mDS, urlPredicate, keywordPredicate = null;
	var timeout = false,inited = false;
	var searchStr;
	var resultPrototype = {
				ar: new Array(),
				defaultIndex: 0,
				errorDescription: null,
				styles: null,
				getCommentAt: function(index){
					return index>=this.ar.length?'':this.ar[index][1].Value;
				},
				getStyleAt: function(index){
					return this.styles;
				},
				getValueAt: function(index){
					return index>=this.ar.length?'':this.ar[index][0].Value;
				},
				removeValueAt: function(rowIndex,isRemoveFromDb){},
		};
    this.QueryInterface = function (iid) {
        if (!iid.equals(Components.interfaces.nsISupports)
            	&& !iid.equals(Components.interfaces.nsIAutoCompleteSearch)
            	&& !iid.equals(Components.interfaces.nsIObserver)
            	){
            throw Components.results.NS_ERROR_NO_INTERFACE;
        }
        return this;
    }
    //forwards requests for history search
    this.onSearchResult = function(search,result){
    	listener.onSearchResult(this,result);
    }
    //does basic initialization of services 
    //(we don't do this during the construction phase, so that memory is not wasted if no searches are performed)
    this.initService = function(){
    	//nsIRunnable runnable , PRUint32 stackSize , PRThreadPriority priority , PRThreadScope scope , PRThreadState state 
    	rdfService = Components.classes["@mozilla.org/rdf/rdf-service;1"]
			.getService(Components.interfaces.nsIRDFService);
		mDS = Components.classes["@mozilla.org/rdf/datasource;1?name=composite-datasource"]
			.getService(Components.interfaces.nsIRDFCompositeDataSource);
		mDS.AddDataSource(rdfService.GetDataSourceBlocking('rdf:bookmarks'));
		mDS.AddDataSource(rdfService.GetDataSourceBlocking('rdf:localsearch'));
		urlPredicate = rdfService
			.GetResource("http://home.netscape.com/NC-rdf#URL");
		keywordPredicate = rdfService
			.GetResource("http://home.netscape.com/NC-rdf#ShortcutURL");
		timeout = Components.classes['@mozilla.org/timer;1']
			.createInstance(Components.interfaces.nsITimer);
		inited = true;
    }
    function executeSearchOn(result,refString){
    	var res = rdfService.GetResource(refString);
    	pred = rdfService.GetResource('http://home.netscape.com/NC-rdf#child');
		var targetsEnumerator = mDS.GetTargets(res, pred, true);
		while(targetsEnumerator.hasMoreElements()){
			var target = targetsEnumerator.getNext();	//bookmark resource
			//get name, url, last visit date
			var linkName = mDS.GetTarget(target,keywordPredicate, true)
				.QueryInterface(Components.interfaces.nsIRDFLiteral);
			var linkUrl = mDS.GetTarget(target,urlPredicate, true)
				.QueryInterface(Components.interfaces.nsIRDFLiteral);
			result.ar.push(new Array(linkName,linkUrl));
		}
    }
    this.observe = function(){
    	var mySearchString = searchStr;
    	function result(){}
    	result.prototype = resultPrototype;
    	var result = new result();
		try{
			//init result parameters
			result.errorDescription = null;
	    	result.searchString = mySearchString;
	    	result.ar = new Array();
			var refString = 'find:datasource=rdf:bookmarks&match=http://home.netscape.com/NC-rdf#ShortcutURL'
					+'&method=contains&text='+encodeURIComponent(mySearchString);
			executeSearchOn(result,refString);
			result.matchCount = result.ar.length;
			if (result.matchCount > 0)
	    		result.searchResult = Components.interfaces.nsIAutoCompleteResult.RESULT_SUCCESS;
	    	else
	    		result.searchResult = Components.interfaces.nsIAutoCompleteResult.RESULT_NOMATCH;
		}catch(e){
			result.matchCount = 0;
			result.searchResult = Components.interfaces.nsIAutoCompleteResult.RESULT_FAILURE;
			result.errorDescription = e.message;
		}
		//Work Around the bug with one blank field
		//if (result.matchCount != 0)
		//	result.matchCount++;
			
    	if (listener != null){
    		listener.onSearchResult(this,result);
    		listener = null;
    	}
    }
    this.returnIgnore = function(){
    	function lResult(){}
		lResult.prototype = resultPrototype;
		var lResult = new lResult();
		lResult.searchResult = Components.interfaces.nsIAutoCompleteResult.RESULT_NOMATCH;
		lResult.matchCount = 0;
		lResult.errorDescription = null;
		lResult.searchString = searchStr;
		listener.onSearchResult(this,lResult);
    }
    //AString searchString , AString searchParam , nsIAutoCompleteResult previousResult , 
   // nsIAutoCompleteObserver listener
    //NOTE to SELF: prevResult is currently not implemented in mozilla but perhaps we could
     //get around it by saving the last search and its timestamp
    this.startSearch = function(searchString ,searchParam , prevResult , lListener){
    	searchParam = searchParam.trim();
    	previousResult = prevResult;
    	searchStr = searchString;
    	listener = lListener;
    	if (searchString.startsWith(['b:','bookmark:','bookmarks:'])){
    		this.returnIgnore();
			return;
    	}
    		
    	if (searchParam){
    		var params = searchParam.split(' ');
	    	for (var i=0;i<params.length;i++){
		    	switch(params[i]){
		    		case 'catonly':
		    			//we don't search catonly searches
		    			returnIgnore();
			    		return;
		    	}
	    	}
    	}
    	if (!inited){
    		this.initService();
    	}else if(timeout){
    		timeout.cancel();
    	}
    	//use timeout so that we don't block the request and plus we don't want to respond to every request
    	timeout.init(this,0,timeout.TYPE_ONE_SHOT);
    }
    this.stopSearch = function(){
    	if (timeout)timeout.cancel();
    	listener = null;
    }
}*/
/**************************************** END OF gnKeywordSearch **********************************
***************************************************************************************************/

/************************************************************************************************** 
***************************************** Start of gnAutocomplete *********************************/
const gIrrelaventWords = ['the'];
const gMinWordLength = 3;
//not a thread-safe service
function gnAutocomplete(){
	var rdfService, mDS, containerUtils;
	var timeout = false,inited = false,initedHistory = false;
	var searchStr, prefix, catonly;
	var historySearch;
	var lastVisitDatePred,lastModDatePred,addDatePred,namePredicate,urlPredicate;
	var resultPrototype = {
				ar: new Array(),
				defaultIndex: 0,
				errorDescription: null,
				styles: null,
				prefix: null,
				getCommentAt: function(index){
					return (index < this.ar.length)?this.ar[index][1]:'';
				},
				getStyleAt: function(index){
					return this.styles;
				},
				getValueAt: function(index){
					return (index < this.ar.length)?this.prefix+this.ar[index][0]:'';
				},
				removeValueAt: function(rowIndex,isRemoveFromDb){},
				setPrefix: function(s){
					this.prefix = s;
				}
		};
    this.QueryInterface = function (iid) {
        if (!iid.equals(Components.interfaces.nsISupports)
            	&& !iid.equals(Components.interfaces.nsIAutoCompleteSearch)
            	&& !iid.equals(Components.interfaces.nsIObserver)
            	&& !iid.equals(Components.interfaces.nsIAutoCompleteObserver)
            	){
            throw Components.results.NS_ERROR_NO_INTERFACE;
        }
        return this;
    }
    //forwards requests for history search
    this.onSearchResult = function(search,result){
    	listener.onSearchResult(this,result);	
    }
    //does basic initialization of services 
    //(we don't do this during the construction phase, so that memory is not wasted if no searches are performed)
    this.initService = function(){
    	//nsIRunnable runnable , PRUint32 stackSize , PRThreadPriority priority , PRThreadScope scope , PRThreadState state 
    	rdfService = Components.classes["@mozilla.org/rdf/rdf-service;1"]
			.getService(Components.interfaces.nsIRDFService);
		mDS = Components.classes["@mozilla.org/rdf/datasource;1?name=composite-datasource"]
			.getService(Components.interfaces.nsIRDFCompositeDataSource);
		mDS.AddDataSource(rdfService.GetDataSourceBlocking('rdf:bookmarks'));
		mDS.AddDataSource(rdfService.GetDataSourceBlocking('rdf:localsearch'));
		containerUtils = Components.classes["@mozilla.org/rdf/container-utils;1"].
            getService(Components.interfaces.nsIRDFContainerUtils);
		urlPredicate = rdfService
			.GetResource("http://home.netscape.com/NC-rdf#URL");
		namePredicate = rdfService
			.GetResource("http://home.netscape.com/NC-rdf#Name");
		lastVisitDatePred = rdfService
			.GetResource("http://home.netscape.com/WEB-rdf#LastVisitDate");
		lastModDatePred = rdfService
			.GetResource("http://home.netscape.com/WEB-rdf#LastModifiedDate");
		addDatePred = rdfService
			.GetResource("http://home.netscape.com/NC-rdf#BookmarkAddDate");
		timeout = Components.classes['@mozilla.org/timer;1']
			.createInstance(Components.interfaces.nsITimer);
		inited = true;
    }
    function removeDuplicates(ar){
    	var newAr = {};
    	for(var i=0;i<ar.length;i++){
    		var cmp = ar[i].toLowerCase();
    		if (!newAr[cmp]){
    			newAr[cmp] = 1;
    		}else{
    			ar.splice(i,1);
    			--i;
    		}
    	}
    	return ar;
    }
    function executeSearchOn(result,refString,duplicates,match1,match2){
    	var res = rdfService.GetResource(refString);
    	pred = rdfService.GetResource('http://home.netscape.com/NC-rdf#child');
		var targetsEnumerator = mDS.GetTargets(res, pred, true);
		while(targetsEnumerator.hasMoreElements()){
			var target = targetsEnumerator.getNext();	//bookmark resource
			//get name, url, last visit date
			var linkName = mDS.GetTarget(target,namePredicate, true)
				.QueryInterface(Components.interfaces.nsIRDFLiteral).Value;
			var linkUrl = mDS.GetTarget(target,urlPredicate, true)
				.QueryInterface(Components.interfaces.nsIRDFLiteral).Value;
			//don't store duplicate values
			if (!duplicates[linkUrl]){
				var relavance = 0;
				if (match1 != null){
					var testStr = linkName;
					var m = testStr.match(match1);
					if (m != null){
						m = removeDuplicates(m);
						relavance = m.length;
						//remove the words that we've just found
						testStr = testStr.replace(match1,'');
					}
					//for non-boundary words give a lesser value for each match
					var m = testStr.match(match2);
					if (m != null)
						relavance += m.length*0.5;
				}
				result.ar.push(new Array(linkUrl,linkName,relavance));
				duplicates[linkUrl] = 1;
			}
		}
    }
    //stores the last valid resource for a path (i.e. for /category1/category2/dfgfd. it will be a resource for cat2)
	var lastFullPath = {};
	lastFullPath.path = null;	// starts and ends with / (i.e. /cat1/cat2/cat3/)
	lastFullPath.res = null;
	//returns the resource for most recent category (i.e. in /cat1/cat2/some word it will be a resource for cat2)
	//it also does some caching by keeping previous resource and path
    function findParentResource(strPath){
    	var res = rdfService.GetResource('NC:BookmarksRoot');
    	var coveredPath = '/';
    	var l;
    	//find a most recent valid parent resource
    	if ((l = strPath.lastIndexOf('/')) != 0 
    			&& (lastFullPath.res != null)){
    		//loop backward through path to find out the last valid point we can use
    		//so that when for example we already had a root for /category1/cat2/ and the user typed /category1/cat
    		//we can use the root /category1 and not backtrack all the way to the root
    		//which would be expensive since we find children folder using simple enumeration
    		path = lastFullPath.path.toLowerCase().replace(new RegExp('[ ]*/[ ]*','g'),'/').replace(/[ ]{2,}/,' ');
    		while(path != '/'){
    			if (strPath.indexOf(path) == 0)break;
    			//remove the last category
    			path = path.substr(0,path.length-1);
    			path = path.substr(0,path.lastIndexOf('/')+1);
    			//if we are at the NC:BookmarksRoot anyway, then break
    			if (path.length == 1){
    				lastFullPath.res = res;
    				break;
    			}
    			//step up one level with a resource
    			var predEnum = mDS.ArcLabelsIn(lastFullPath.res);
    			//it should be just one element
    			if (!predEnum.hasMoreElements()){
    				//if unable to find the predicate for some reason
    				lastFullPath.res = res;
    				path = '/';
    				break;
    			}
    			var pred = predEnum.getNext();
    			lastFullPath.res = mDS.GetSource(pred,lastFullPath.res,true)
    				.QueryInterface(Components.interfaces.nsIRDFResource);	//parent subject
    		}
    		res = lastFullPath.res;
    		var length = path.replace(new RegExp('^/'),'').replace(new RegExp('/$'),'').split('/').length;
    		var pathAr = lastFullPath.path.replace(new RegExp('^/'),'').replace(new RegExp('/$'),'').split('/');
    		while(pathAr.length != length){pathAr.pop()}
    		coveredPath = ('/'+pathAr.join('/')+'/').replace(new RegExp('/{2,}','g'),'/');
    	}
    	lastFullPath.path = coveredPath;
    	//we need this sicne lastFullPath will be updated with the path the user types in not the actual path
    	var actPath = {
    		res: null,
    		path: coveredPath
    	}
    	//strip / from start and end
    	var covered = coveredPath.substr(1,((coveredPath.length>1)?coveredPath.length:2)-2);
    	var toCover = strPath.substr(1,(l?l:1)-1);
    	covered = (covered != '')?covered.split('/').length:0;
    	toCover = (toCover != '')?toCover.split('/'):[];
    	var catLevel;
    	//find the actual resource
    	for (catLevel = covered;catLevel<toCover.length;catLevel++){
    		var predEnum = mDS.ArcLabelsOut(res);
    		var found = false;
    		while(predEnum.hasMoreElements()){
    			var pred = predEnum.getNext();
    			var target = mDS.GetTarget(res,pred,true);
    			//it must be a resource to be a folder
    			if (!(target instanceof Components.interfaces.nsIRDFResource))continue;
    			target.QueryInterface(Components.interfaces.nsIRDFResource);
    			//if it's not a folder continue
    			if (!containerUtils.IsContainer(mDS,target))continue;
    			//get it's name
    			var val = mDS.GetTarget(target,namePredicate,true)
    				.QueryInterface(Components.interfaces.nsIRDFLiteral);
    			var v = val.Value;
    			//compare where it matches
    			if (v.trim().toLowerCase().replace(/[ ]{2,}/,' ') 
    					== toCover[catLevel] && res.Value != target.Value){
    				lastFullPath.path += v+'/';
    				res = target;
    				found = true;
    				break;
    			}
    		}
    		//if we were unable to find a resource on this level, then it's an invalid entry
    		if (!found && (catLevel<toCover.length)){
    			res = null;
    			break;
    		}
    	}
    	lastFullPath.res = res;
    	return lastFullPath;
    }
    /*iterates through children and descends in them based on how many results have been printed*/
    function iterateThroughResource(res,result,lastWord,additionalLevels,additionalPrefix){
    	if (!additionalLevels)additionalLevels = 0;
    	if (!additionalPrefix)additionalPrefix = '';
    	if (additionalLevels >= 4)return;
    	var predEnum = mDS.ArcLabelsOut(res);
    	
    	var count = 0;
    	var children = [];
    	while(predEnum.hasMoreElements()){
	    	var pred = predEnum.getNext();
	    	var child = mDS.GetTarget(res,pred,true);
	    	if (!(child instanceof Components.interfaces.nsIRDFResource)
	    			|| child.Value == res.Value)continue;
	    	
	    	child.QueryInterface(Components.interfaces.nsIRDFResource);
	    	//if it's a link
	    	var url = null;
	    	if ((url = mDS.GetTarget(child,urlPredicate,true)) != null)
	    		url.QueryInterface(Components.interfaces.nsIRDFLiteral);
	    	
	    	//if it's not a url and not a folder, then skip
	    	if ((url != null && catonly) 
	    			|| (url == null && !containerUtils.IsContainer(mDS,child)))continue;
	    		
	    	var name = mDS.GetTarget(child,namePredicate,true)
	    					.QueryInterface(Components.interfaces.nsIRDFLiteral);
	    	//if it doesn't match the already typed string
	    	if (lastWord != '' && !name.Value.trim().toLowerCase()
	    								.replace(/[ ]{2,}/,' ').startsWith(lastWord))continue;
	    	
	    	var linkDate = null;
	    	if (url)
	    		linkDate = mDS.GetTarget(child,lastVisitDatePred, true);
			if (linkDate == null)
				linkDate =  mDS.GetTarget(child,lastModDatePred, true);
			if (linkDate == null)
				linkDate =  mDS.GetTarget(child,addDatePred, true);
			if (linkDate instanceof Components.interfaces.nsIRDFDate)
				linkDate = linkDate.QueryInterface(Components.interfaces.nsIRDFDate).Value;
			else
				linkDate = '';
				
			result.ar.push(
				[additionalPrefix+name.Value+(url?'':'/'),
					url?url.Value:'',
					linkDate
				]
			);			
	    	//gather some children if there's not enough
	    	if (children.length < 5 && count < 10 && url == null){
	    		children.push([child,additionalPrefix+name.Value+'/']);
	    	}	
	    	++count;
	    }
	    ++additionalLevels;
	    for (var i=0;i<children.length;i++){
	    	iterateThroughResource(children[i][0],result,'',additionalLevels,children[i][1])
	    }
    }
    this.observe = function(){
    	if (listener == null)return;
    	
    	var mySearchString = searchStr;
    	function result(){}
    	result.prototype = resultPrototype;
    	var result = new result();
		try{
			//init result parameters
			result.errorDescription = null;
	    	result.searchString = mySearchString;
	    	result.ar = [];
	    	mySearchString = mySearchString.toLowerCase().replace(new RegExp('[ ]*/[ ]*','g'),'/').replace(/[ ]{2,}/,' ');
	    	function compareFunction(a,b){
    				if (a[2] > b[2])
    					return -1;
    				else if(a[2] < b[2])
    					return 1;
    				return 0;
    			}
	    	if (mySearchString.charAt(0) == '/'){
	    		var l = mySearchString.lastIndexOf('/');
	    		var lastWord = (mySearchString.length > (l+1))?mySearchString.substr(l+1):'';
	    		//first determine the path we already know
	    		var res = null;
	    		actPath = findParentResource(mySearchString);
	    		res = actPath.res;
	    		if (res != null){
		    		//iterate through children
	    			result.setPrefix(prefix+actPath.path);
	    			iterateThroughResource(res,result,lastWord);
    			}
    			//sort date by descending
    			result.ar.sort(compareFunction);
	    	}else if(!catonly){
	    		result.setPrefix('');
	    		var stringMatch = 'contains';
		    	if(mySearchString.charAt(0) == '^'){
					stringMatch = 'startswith';
					mySearchString = mySearchString.substr(1);
				}else if(mySearchString.charAt(0) == '$'){
					stringMatch = 'endswith';
					mySearchString = mySearchString.substr(1);
				}
				var words = mySearchString.split(/[ ]+/);
				var i;
				var newWordsArry = new Array();
				//use only important words
				for(i=0;i<words.length;i++){
					if(words[i].length >= gMinWordLength
						&& !words[i].startsWith(
								gIrrelaventWords
							)
						){
						newWordsArry.push(RegExp.escape(words[i]));
					}	
				}
				var match1 = null;
				var match2 = null;
				if (newWordsArry.length >= 1){
					match1 = new RegExp('(?:\\b'+newWordsArry.join('\\b)|(?:\\b')+'\\b)','gi');
					match2 = new RegExp(newWordsArry.join('|'),'gi');
				}
				var refString = 'find:datasource=rdf:bookmarks&match=http://home.netscape.com/NC-rdf#Name'
						+'&method='+stringMatch+'&text='+encodeURIComponent(mySearchString);
				var duplicates = new Array();
				//this seems to be a reasonable thing to do only for "contains"
				if (stringMatch == 'contains' && words.length > 1){
					for (i=0;i<words.length;i++){
			    		refString = 'find:datasource=rdf:bookmarks&match=http://home.netscape.com/NC-rdf#Name'
							+'&method='+stringMatch+'&text='+encodeURIComponent(words[i]);
						executeSearchOn(result,refString,duplicates,match1,match2);
					}
				}else{
					executeSearchOn(result,refString,duplicates,match1,match2);
				}
				//do not sort if relevance is irrelevant
				if (newWordsArry.length >= 1){
					result.ar.sort(compareFunction);
				}
			}
			result.matchCount = result.ar.length;
			if (result.matchCount > 0)
	    		result.searchResult = Components.interfaces.nsIAutoCompleteResult.RESULT_SUCCESS;
	    	else
	    		result.searchResult = Components.interfaces.nsIAutoCompleteResult.RESULT_NOMATCH;
		}catch(e){
			result.matchCount = 0;
			result.searchResult = Components.interfaces.nsIAutoCompleteResult.RESULT_FAILURE;
			result.errorDescription = e.message;
		}
		//Work Around the bug with one blank field
		//if (result.matchCount != 0)
			//result.matchCount++;
			
    	if (listener != null){
    		listener.onSearchResult(thisRet,result);
    	}
    }
    var thisRet = this;
    var isHistorySearch = false;
   // var prevSearches = [];	//keeps track of the last 3 searches
    /*AString searchString , AString searchParam , nsIAutoCompleteResult previousResult , 
    nsIAutoCompleteObserver listener */
    /*NOTE to SELF: prevResult is currently not implemented in mozilla but perhaps we could
     *get around it by saving the last search and its timestamp*/
    this.startSearch = function(searchString ,searchParam , prevResult , lListener){
    	thisRet = this;
    	var originalSearch = new String(searchString);
    	searchString = searchString.replace(/^\s+/,'');
    	var which;
    	//set defaults
    	var enablehistry = true;
    	catonly = false;
    	prefix = 'b:';
    	if (searchParam){
    		var params = searchParam.split(' ');
	    	for (var i=0;i<params.length;i++){
		    	switch(params[i]){
		    		case 'noprefix':
		    			prefix = '';
		    			break;
		    		case 'nohistory':
		    			enablehistry = false;
		    			break;
		    		case 'catonly':
		    			catonly = true;
		    			break;
		    	}
	    	}
    	}
    	if (enablehistry){
	    	if (!(which = searchString.startsWith(['b:','/']))){
	    		if (!initedHistory){
	    			historySearch = Components.classes['@mozilla.org/autocomplete/search;1?name=history']
	    				.getService(Components.interfaces.nsIAutoCompleteSearch);
	    			initedHistory = true;
	    		}
	    		isHistorySearch = true;
	    		listener = lListener;
	    		historySearch.startSearch(searchString,searchParam,prevResult,this);
	    		return;
	    	}else if((searchString = searchString.substr(((which == 2)?0:(searchString.indexOf(':')+1))).trim()) == ''){
	    		function lResult(){}
	    		lResult.prototype = resultPrototype;
	    		var lResult = new lResult();
	    		lResult.searchResult = Components.interfaces.nsIAutoCompleteResult.RESULT_IGNORED;
	    		lResult.matchCount = 0;
	    		lResult.errorDescription = null;
	    		lResult.searchString = searchString;
	    		lListener.onSearchResult(this,lResult);
	    		return;
	    	}
	    }else{
	    	which = searchString.startsWith('b:');
	    	searchString = searchString.substr((which == 0)?0:(searchString.indexOf(':')+1)).trim();
	    }
    	isHistorySearch = false;
    	if (!inited){
    		this.initService();
    	}else if(timeout){
    		timeout.cancel();
    	}
    	//prevSearches.push(originalSearch);
    	previousResult = prevResult;
    	searchStr = searchString;
    	listener = lListener;
		//do backspace buffering check
    	/*var flag = true;
    	for (var i = (prevSearches.length-1);i > 0;i--){
    		if (prevSearches[i].length != (prevSearches[i-1].length-1)
    			|| prevSearches[i] != prevSearches[i-1].substr(0,prevSearches[i].length)){
    			flag = false;
    		}
    	}
    	//only store gBackSpaceBuf last requests
    	if (prevSearches.length > gBackSpaceBuf)
    		prevSearches.shift();
    	//if backspace indeed was pressed repeatedly, then wait awhile
    	if (flag && prevSearches.length == gBackSpaceBuf){
    		//do some buffering
    		timeout.init(this,500,timeout.TYPE_ONE_SHOT);*/
    	//}else{
    		timeout.init(this,0,timeout.TYPE_ONE_SHOT);
    	//}
    }
    this.stopSearch = function(){
    	if (timeout)timeout.cancel();
    	listener = null;
    	if (isHistorySearch)
    		historySearch.stopSearch();
    }
}
/**************************************************************************************************
****************************************** END OF gnAutocomplete **********************************
***************************************************************************************************/

/**************************************************************************************************
***************************************** Start OF gnProtocol **********************************
***************************************************************************************************/
var gnProtocolUtils = {
	parseURL: function(url){
		var path, url;
		var matches = url.match(new RegExp('\&?path=([^&]+)'));
		if (matches != null && matches.length == 2){
			path = decodeURIComponent(matches[1]);
			path = path.replace(/\+/g,' ');
		}
		matches = url.match(new RegExp('\&?url=([^&]+)'));
		if (matches != null && matches.length == 2)
			url = decodeURIComponent(matches[1]);
		if (url == null)
			return false;
		//corrent automatic appending
		if (url.indexOf('?') != -1)
			url = url.replace(new RegExp('/$'),'');
		if (path == null)
			path = '/'+url;
		return {path: path,url: url};
	}
}
function gnContentHandler(){}
gnContentHandler.prototype = {
	QueryInterface: function (aIID){
		if (!aIID.equals(Components.interfaces.nsIContentHandler))
			throw Components.results.NS_ERROR_NO_INTERFACE;
		return this;
   },
   createBookmark: function(bookmark){
        var os = Components.classes["@mozilla.org/observer-service;1"]
        	.getService(Components.interfaces.nsIObserverService);
        var obj = {
        	description: '',
        	postData: '',
        	charset: 'UTF-8',
        	url: bookmark.url,
        	path: bookmark.path,
        	type: 'feed'
        }
        var value = '';
        for (var i in obj){
        	value += '&'+i+'='+encodeURIComponent(obj[i]);
        }
        os.notifyObservers(null,'gnafi:talking','addbookmark:'+value);
   },
   handleContent: function (aContentType, aWindowTarget, aRequest){
   		var win = aWindowTarget.getInterface(Components.interfaces.nsIDOMWindowInternal);
   		//parse url
   		var spec = aRequest.QueryInterface(Components.interfaces.nsIChannel).URI.spec
	    var bookmark = gnProtocolUtils.parseURL(spec);
	    if (!bookmark)
            return;
      	bookmark.path = bookmark.path
     			.replace(new RegExp('^[/ ]+|[/ ]+$','g'),'')
     			.replace(new RegExp('[ ]*/+[ ]*','g'),'/');
     	if (bookmark.path == '')
     		bookmark.path = bookmark.url;
     	//should this be localized?
     	bookmark.cat = bookmark.path.replace(/^<toolbar>/,'Bookmarks Toolbar Folder');
   		if (!this._bundle) {
   			var sbs = Components.classes["@mozilla.org/intl/stringbundle;1"]
   				.getService(Components.interfaces.nsIStringBundleService);
   			this._bundle = sbs.createBundle("chrome://gnafi/locale/gnafi.properties");
   		}
   		var title = this._bundle.GetStringFromName("addBookmarkPromptTitle");
   		var msg = this._bundle.formatStringFromName("addBookmarkPromptMessage", [bookmark.cat], 1);
   		var addBookmarkStr = this._bundle.GetStringFromName("addBookmarkPromptButton");
   		
   		const nsIPromptService = Components.interfaces.nsIPromptService;
   		var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(nsIPromptService);
     	var flags = (nsIPromptService.BUTTON_TITLE_IS_STRING * nsIPromptService.BUTTON_POS_0) 
     		+ (nsIPromptService.BUTTON_TITLE_CANCEL * nsIPromptService.BUTTON_POS_1);
     	var rv = promptService.confirmEx(win, title, msg, flags, addBookmarkStr, null, null, null, {value: 0});
     	if (rv == 0) {
     		this.createBookmark(bookmark);
        }
   }
}	
	
	
function gnProtocolHandler(){}
 
 gnProtocolHandler.prototype = {
   _PHIID: Components.interfaces.nsIProtocolHandler,
   
   get scheme()          { return "livefeed"; },
   get protocolFlags()   { return this._PHIID.URI_NORELATIVE | this._PHIID.URI_NOAUTH },
   get defaultPort()     { return 0; },
   
   allowPort: function (aPort, aScheme)
   {
     return false;
   },
   
   newURI: function (aSpec, aOriginalCharset, aBaseURI)
   {
     const nsIStandardURL = Components.interfaces.nsIStandardURL;
     var uri = Components.classes["@mozilla.org/network/standard-url;1"].createInstance(nsIStandardURL);
     uri.init(nsIStandardURL.URLTYPE_STANDARD, 6667, aSpec, aOriginalCharset, aBaseURI);
 
     return uri.QueryInterface(Components.interfaces.nsIURI);
   },
   
   newChannel: function (aURI)
   {
     var ioService = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
     if (!ioService.allowPort(aURI.port, aURI.scheme))
       throw Components.results.NS_ERROR_FAILURE;
     
     return new nsDummyChannel(aURI);
   },  
 
   QueryInterface: function (aIID)
   {
     if (!aIID.equals(Components.interfaces.nsIProtocolHandler) &&
         !aIID.equals(Components.interfaces.nsISupports))
       throw Components.results.NS_ERROR_NO_INTERFACE;
     
     return this;        
   }
 };
 ///////////////////////////////////////////////////////////////////////////////
 // Dummy Channel used by nsBookmarksProtocolHandler
 function nsDummyChannel(aURI)
 {
   this.URI = aURI;
   this.originalURI = aURI;
 }
 
 nsDummyChannel.prototype = {
   /////////////////////////////////////////////////////////////////////////////
   // nsISupports
   QueryInterface: function (aIID)
   {
     if (!aIID.equals(Components.interfaces.nsIChannel) && 
         !aIID.equals(Components.interfaces.nsIRequest) && 
         !aIID.equals(Components.interfaces.nsISupports))
       throw Components.results.NS_ERROR_NO_INTERFACE;
     return this;
   },
   
   /////////////////////////////////////////////////////////////////////////////
   // nsIChannel
   loadAttributes:         null,
   contentType:            "x-application-gnafi",
   contentLength:          0,
   owner:                  null,
   loadGroup:              null,
   notificationCallbacks:  null,
   securityInfo:           null,
   
   open: function ()
   {
     throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
   },
   
   asyncOpen: function (aObserver, aContext)
   {
     aObserver.onStartRequest(this, aContext);
   },
   
   asyncRead: function (aListener, aContext)
   {
     return aListener.onStartRequest(this, aContext);
   },
 
   /////////////////////////////////////////////////////////////////////////////
   // nsIRequest
   isPending: function () 
   { 
     return true;
   },
   
   _status: Components.results.NS_OK,
   cancel: function (aStatus) 
   { 
     this._status = aStatus; 
   },
   
   suspend: function ()
   {
     throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
   },
   
   resume: function ()
   {
     throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
   }
 };
 /*************************************************************************************************
***************************************** End OF gnProtocols ***************************************
**************************************************************************************************/


/*************************************************************************************************
***************************************** START OF UTILITIES ***************************************
**************************************************************************************************/	
var log = '';
function dmp(str,title){
	if (MYDEBUG){
		if ((typeof KEEP_LOG) != 'undefined')log+=str+'\r\n';
		if ((typeof str) == 'undefined')var str = '';
		dump(':'+(((typeof title) == 'undefined')?'':title+':')+str+'\r\n');
	}
}
function genRandStr(length){
		var ar = [];
		var str = '';
		for (var i = 97;i<123;i++){
			ar.push(String.fromCharCode(i));
		}
		for (i=0;i<length;i++){
		    str += ar[Math.floor(Math.random()*26)];
		}
		return str;
	}
	function wrapInto(w,o){for(var v in o){eval('w.'+v+' = o.'+v+';')}}
	String.prototype.trim = function(){ return this.replace(/^\s+|\s+$/g,'') }
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
	String.prototype.unescHtml = function(){
	r = this;
	var e = [['<','&lt;'],['>','&gt;'],['&','&amp;'],['"','&quot;']];
	for(var i=0;i<e.length;i++){
		r = r.strReplace(e[i][0],e[i][1])}
	return r;
}
	//v is either a string or an array
	//return 0 if false, index of the element +1 if found
	String.prototype.startsWith = function(v){
		var res = 0;
		if (v instanceof Array){
			for (var i = 0;i<v.length;i++){
				if (this.substr(0,v[i].length) == v[i]){
					res = (i+1);
					break;
				}
			}
		}else{
			if (this.substr(0,v.length) == v)
				res = 1;
		}
		return res;
	}
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
	function GnafiUserFunc(){
		dmp('check cookies');
		this.username = null;
		var cookieManager = Components.classes["@mozilla.org/cookiemanager;1"]
			.getService(Components.interfaces.nsICookieManager);
		var iter = cookieManager.enumerator;
		while (iter.hasMoreElements()){
			var cookie = iter.getNext();
			if (cookie instanceof Components.interfaces.nsICookie
					&& this.doCookieCheck(cookie)){
				break;
			}
	  	}
	}
	GnafiUserFunc.prototype = {
		username : null,
		expires: null,
		regex: new RegExp('gnafi\.[a-z]+$','gi'),
		isSignedIn : function(cookie){
			if (this.username == null 
						&& cookie instanceof Components.interfaces.nsICookie2){
				dmp('doing cookie check');
				this.doCookieCheck(cookie);	
			}
			dmp('is signed returning...'+(this.username != null));
			return (this.username != null);
		},
		invalidate: function(){
			this.username = null;
			this.expires = null;
		},
		isOurCurrentCookie: function(cookie){
			if (cookie.host.match(this.regex)
					&& cookie.name == 'cookie[username]' 
					&& cookie.expires == this.expires){
				return true;
			}
			return false;
		},
		isExpired: function(cookie){
			if (cookie.host.match(this.regex)
					&& cookie.name == 'cookie[username]' 
					&& ((Date.now()/1000) > cookie.expires)){
				return true;
			}
			return false;
		},
		doCookieCheck : function(cookie){
			if (cookie.host.match(this.regex)){
				if (cookie.name == 'cookie[username]'){
					this.expires = cookie.expires;
					this.username = ((Date.now()/1000) < cookie.expires)?cookie.value:null;
					return (this.username != null);
				}
			}
			return false;
		}
	}
/*************************************************************************************************
***************************************** END OF UTILITIES ***************************************
**************************************************************************************************/	
var gModule = {
	firstTime: true,
    SYNC_CID: Components.ID("{83313f6e-b9c4-48d9-a27a-1db0a04d486b}"),
    SYNC_CLASS_NAME: "Gnafi Bookmarks",
    SYNC_CONTRACT_ID: "@mozilla.org/rdf/datasource;1?name=gnbookmarksync",
    
  /*  KEYWORD_CLASS_ID: Components.ID("{bf03c655-e7ef-4ae4-a99b-f7f6f5297029}"),
    KEYWORD_CLASS_NAME: "Gnafi Bookmarks Autocomplete",
    KEYWORD_CONTRACT_ID: "@mozilla.org/autocomplete/search;1?name=gnafikeywords",*/
	
	PROTOCOL_CID: Components.ID("{1bb5c19c-d5c6-45ca-b2e5-1663ba101857}"),
    PROTOCOL_CLASS_NAME: "Gnafi Protocol Handler",
    PROTOCOL_CONTRACT_ID: "@mozilla.org/network/protocol;1?name=livefeed",
    
    CONTENT_CID: Components.ID("{d86b794b-4f55-4219-a32c-51d72a92b09a}"),
    CONTENT_CLASS_NAME: "Gnafi Content Handler",
    CONTENT_CONTRACT_ID: "@mozilla.org/uriloader/content-handler;1?type=x-application-gnafi",
    
    AUTO_CLASS_ID: Components.ID("{2711d34e-5413-4aac-b018-4a3736d6446f}"),
    AUTO_CLASS_NAME: "Gnafi Bookmarks Autocomplete",
    AUTO_CONTRACT_ID: "@mozilla.org/autocomplete/search;1?name=gnafibookmarks",
    
    registerSelf: function (compMgr, fileSpec, location, type) {
        if (this.firstTime) {
            this.firstTime = false;
            throw Components.results.NS_ERROR_FACTORY_REGISTER_AGAIN;
        }
  		
        compMgr = compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
        //register bookmarking service
        compMgr.registerFactoryLocation(this.SYNC_CID,
                                        this.SYNC_CLASS_NAME,
                                        this.SYNC_CONTRACT_ID,
                                        fileSpec,
                                        location,
                                      type);
       /* compMgr.registerFactoryLocation(this.KEYWORD_CLASS_ID,
                                        this.KEYWORD_CLASS_NAME,
                                        this.KEYWORD_CONTRACT_ID,
                                        fileSpec,
                                        location,
                                        type);*/
         //register protocol handler
        compMgr.registerFactoryLocation(this.PROTOCOL_CID,
                                    this.PROTOCOL_CLASS_NAME,
                                    this.PROTOCOL_CONTRACT_ID,
                                    fileSpec, location, type);
                                    
        //register content listener
        compMgr.registerFactoryLocation(this.CONTENT_CID,
                                    this.CONTENT_CLASS_NAME,
                                    this.CONTENT_CONTRACT_ID,
                                    fileSpec, location, type);
        
        compMgr.registerFactoryLocation(this.AUTO_CLASS_ID,
                                        this.AUTO_CLASS_NAME,
                                        this.AUTO_CONTRACT_ID,
                                        fileSpec,
                                        location,
                                        type);

    },
	unregisterSelf: function(compMgr, fileSpec, location){
	},
    getClassObject : function (compMgr, cid, iid) {
        if (cid.equals(this.SYNC_CID))
        	return this.gnSyncFactory;
        /*if (cid.equals(this.KEYWORD_CLASS_ID))
        	return this.gnKeywordFactory;*/
        if (cid.equals(this.PROTOCOL_CID))
        	return this.gnProtocolFactory;
        if (cid.equals(this.CONTENT_CID))
        	return this.gnContentFactory;
        if (cid.equals(this.AUTO_CLASS_ID))
        	return this.autocompleteFactory;
        	
        if (!iid.equals(Components.interfaces.nsIFactory))
        	throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
        throw Components.results.NS_ERROR_NO_INTERFACE
    },
	/*gnKeywordFactory: {
        createInstance: function (outer, iid) {
            if (outer != null) throw Components.results.NS_ERROR_NO_AGGREGATION;
            return (new gnKeywordSearch()).QueryInterface(iid);
        }
    },*/
    gnSyncFactory: {
        createInstance: function (outer, iid) {
            if (outer != null) throw Components.results.NS_ERROR_NO_AGGREGATION;
            if (!iid.equals(Components.interfaces.nsISupports)
        			&& !iid.equals(Components.interfaces.nsIObserver)
            		&& !iid.equals(Components.interfaces.nsITimerCallback)
            		&& !iid.equals(Components.interfaces.nsIRDFXMLSinkObserver))
        		throw Components.results.NS_ERROR_INVALID_ARG;
            var gn = new gnSyncBookmarks()
            gn.startTimeout = Components.classes['@mozilla.org/timer;1']
	    			.createInstance(Components.interfaces.nsITimer);
	    	gn.startTimeout.init(gn,0,Components.interfaces.nsITimer.TYPE_ONE_SHOT);
            return gn;
        }
    },
    gnProtocolFactory: {
        createInstance: function (outer, iid) {
           if (outer != null)throw Components.results.NS_ERROR_NO_AGGREGATION;
           if (!iid.equals(Components.interfaces.nsIProtocolHandler) 
           			&& !iid.equals(Components.interfaces.nsISupports))
        		throw Components.results.NS_ERROR_INVALID_ARG;
    		return new gnProtocolHandler();
        }
    },
    gnContentFactory: {
        createInstance: function (outer, iid) {
        	if (outer != null)throw Components.results.NS_ERROR_NO_AGGREGATION;
        	if (!iid.equals(Components.interfaces.nsIContentHandler) 
        			&& !iid.equals(Components.interfaces.nsISupports))
        		throw Components.results.NS_ERROR_INVALID_ARG;
    		return new gnContentHandler();
        }
    },
    autocompleteFactory: {
        createInstance: function (outer, iid) {
            if (outer != null) throw Components.results.NS_ERROR_NO_AGGREGATION;
            return (new gnAutocomplete()).QueryInterface(iid);
        }
    },
    canUnload: function(compMgr) {
        return true;
    }
};

function NSGetModule(compMgr, fileSpec) { return gModule; }