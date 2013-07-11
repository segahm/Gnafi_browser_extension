// install.js
// XpiInstaller
// By Pike (Heavily inspired by code from Henrik Gemal and Stephen Clavering)
function XpiInstaller(){
	const XPCOM_NAMES_JS = ['gnBookmarks'];
	const XPCOM_NAMES_XPT = [];

	// --- Editable items begin ---
	var extFullName = 'Gnafi'; // The name displayed to the user (don't include the version)
	var extShortName = 'gnafi'; // The leafname of the JAR file (without the .jar part)
	var extVersion = '0.3.3';
	var extAuthor = 'Sergey Mirkin';
	var extLocaleNames = []; // e.g. ['en-US'; 'en-GB']
	var extSkinNames = []; // e.g. ['classic'; 'modern']
	var extPostInstallMessage = null; // Set to null for no post-install message
	// --- Editable items end ---
	var extKey = '{7f82b9b7-8387-4f04-9d6e-09c7618ae52a}';
	var profileInstall = true;
	var silentInstall = false;
	this.install = function(){
		try{
			var jarName = extShortName + '.jar';
			var profileDir = Install.getFolder('Profile', 'chrome');
			Install.alert(profileDir);
			// Parse HTTP arguments
			parseArguments();
			// Check if extension is already installed in profile
			if (File.exists(Install.getFolder(profileDir, jarName))){
				if (!silentInstall){
					Install.alert('Updating existing Profile install of ' + extFullName + ' to version ' + extVersion + '.');
				}
				profileInstall = true;
			}else if (!silentInstall){
				// Ask user for install location, profile or browser dir?
				profileInstall = Install.confirm('Install ' + extFullName + ' ' + extVersion + ' to your Profile directory (OK) or your Browser directory (Cancel)?');
			}
			
			// Init install
			var dispName = extFullName + ' ' + extVersion;
			var regName = '/' + extAuthor + '/' + extShortName;
			Install.initInstall(dispName, regName, extVersion);
			// Find directory to install into
			var installPath;
			if (profileInstall) installPath = profileDir;
			else installPath = Install.getFolder('chrome');
			
			// Add JAR file
			Install.addFile(null,'chrome/'+jarName, installPath, null);
			
			// Register chrome
			var jarPath = Install.getFolder(installPath, jarName);
			var installType = profileInstall ? Install.PROFILE_CHROME : Install.DELAYED_CHROME;
			
			// Register content - no need due to contents.rdf
			//Install.registerChrome(Install.CONTENT | installType, jarPath, 'content/');
			
			for (var i=0;i< extLocaleNames.length;++i){
				var regPath = 'locale/' + extLocaleNames[i]+'/';
				//Install.registerChrome(Install.LOCALE | installType, jarPath, regPath);
			}
			// Register skins
			for (var i=0;i< extSkinNames.length;++i){
				var regPath = 'skin/' + extSkinNames[i]+'/';
				//Install.registerChrome(Install.SKIN | installType, jarPath, regPath);
			}
			// Register components
			var compDir = getFolder("Components"), x;
			for (x = 0; x < XPCOM_NAMES_JS.length; x++)
				Install.addFile(null, extVersion,"components/"+XPCOM_NAMES_JS[x]+".js", compDir, null);
			for (x = 0; x < XPCOM_NAMES_XPT.length; x++)
				Install.addFile(null, extVersion, "components/"+XPCOM_NAMES_XPT[x]+".xpt", compDir, null);
			// Perform install
			var err = Install.performInstall();
			if (err == Install.SUCCESS || err == Install.REBOOT_NEEDED){
				if (!silentInstall && extPostInstallMessage){
					Install.alert(extPostInstallMessage);
				}
			}else{
				handleError(err);
				return;
			}
		}catch(e){
			handleError(e.message);
		}
	}
	function parseArguments(){
		// Can't use string handling in install, so use if statement instead
		var args = Install.arguments;
		if (args == 'p=0'){
			profileInstall = false;
			silentInstall = true;
		}else if (args == 'p=1'){
			profileInstall = true;
			silentInstall = true;
		}
	}
	function handleError(err){
		if (!silentInstall){
			Install.alert('Error: Could not install ' + extFullName + ' ' + extVersion + ' (Error code: ' + err + ')');
		}
		Install.cancelInstall(err);
	}
}
var xpi = new XpiInstaller();
xpi.install();