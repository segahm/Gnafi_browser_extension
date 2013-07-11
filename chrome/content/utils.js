function MyUtils(ds){
	var mDS = ds;
	var mRdfService = Components.classes["@mozilla.org/rdf/rdf-service;1"]
				.getService(Components.interfaces.nsIRDFService);
	var mBService = Components.classes["@mozilla.org/browser/bookmarks-service;1"]
				.getService(Components.interfaces.nsIBookmarksService);
	var mRepeatResource = null;
	var containerUtils = Components.classes["@mozilla.org/rdf/container-utils;1"].
            getService(Components.interfaces.nsIRDFContainerUtils);
	this.dumpResource = function(res){
		mRepeatResource = [];
		var s = iterateOverResource(res);
		var gClipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
    		.getService(Components.interfaces.nsIClipboardHelper);
  		gClipboardHelper.copyString(s);
	}
	var interfaces = new Array();
	var initedInterfaces = false;
	function iterateOverResource(res,insStr){
    	if (!insStr)insStr = '';
    	if (mRepeatResource[res.Value]){
    		return '\r\ndroping repeat of '+res.Value;
    	}
    	mRepeatResource[res.Value] = true;
    	var s = insStr+'resource: '+res.Value+(containerUtils.IsSeq(mDS,res)?' - SEQ':'')+'\r\n';
    	var enum = mDS.ArcLabelsOut(res);
		var predicateCount = 0;
		while(enum.hasMoreElements()){
			predicateCount++;
			var predicate = enum.getNext();
			predicate.QueryInterface(Components.interfaces.nsIRDFResource);
			s += insStr+'\tpredicateName: '+predicate.Value+(containerUtils.IsSeq(mDS,predicate)?' - SEQ':'')+',\r\n\t'+insStr+'targets: \r\n';
			var targetsEnum = mDS.GetTargets(res, predicate, true);
			var targetCount = 0;
			while(targetsEnum.hasMoreElements()){
				targetCount++;
				var target = targetsEnum.getNext();
				if (target instanceof Components.interfaces.nsIRDFLiteral){
					target.QueryInterface(Components.interfaces.nsIRDFLiteral);
					s += insStr+'\t\tt:'+target.Value+',\r\n';
				}else if(target instanceof Components.interfaces.nsIRDFResource){
					target.QueryInterface(Components.interfaces.nsIRDFResource);
					s += iterateOverResource(target,insStr+'\t\t')+',';
				}else{
					s += insStr+'\t\tt:>>';
					var obj =  Components.interfaces;
					if (initedInterfaces)
						obj = interfaces;
					for (var el in obj) {
					        try {
					            target.QueryInterface(obj[el]);
					            if (!initedInterfaces)
					            	interfaces[el] = obj[el];
					            s += el+',';
					        } catch(e) {}
					    }
					initedInterfaces = true;
					 
					s += '<,\r\n';
				}
			}
			s += '\r\n\t'+insStr+'targetCount: '+targetCount+',\r\n';
		}
		return s+insStr+'predicateCount: '+predicateCount+'\r\n';
    }
    this.getParentChain = function(resource){
    	var ar = mBService.getParentChain(resource);
    	var enum = ar.enumerate();
    	var str = '';
    	var namePred = mRdfService.GetResource('http://home.netscape.com/NC-rdf#Name');
    	var target;
    	while(enum.hasMoreElements()){
    		var res = enum.getNext().QueryInterface(Components.interfaces.nsIRDFResource);
    		target = mDS.GetTarget(res,namePred,true);
    		if (target == null){
    			alert(res.Value);
    			target = mRdfService.GetLiteral('<root>');
    		}else{
    			target.QueryInterface(Components.interfaces.nsIRDFLiteral);
    		}
    		str += '/'+target.Value;
    	}
    	//now the resource itself
    	target = mDS.GetTarget(resource,namePred,true);
    	target.QueryInterface(Components.interfaces.nsIRDFLiteral);
    	str += '/'+target.Value;
    	return str;
    }
    function supports(target){
    	var s = '';
		for (var el in Components.interfaces){
			try {
				target.QueryInterface(Components.interfaces[el]);
				s += el+',';
			 } catch(e) {}
		}
		return s;
    }
}
MyUtils.copy = function(s){
	var gClipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
    		.getService(Components.interfaces.nsIClipboardHelper);
  		gClipboardHelper.copyString(s);
}