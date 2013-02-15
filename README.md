switchyd
----
chrome plugin that mainly focus on aotomatic proxing [GFWed](http://en.wikipedia.org/wiki/GFW) sites.

What it does & How it works
----
detect failed site request and add it to generated pac scripts.
in most of the case,you need just refresh the page a seconrd time to meet the normal view.

currently,it use *SOCKS5:127.0.0.1:10086* as it proxy server.  
it is not directly configurable now(modify code is another case), it should provide configuration page *future*.

failure include:
- net::ERR_CONNECTION_RESET  
- net::ERR_CONNECTION_ABORTED  
- net::ERR_CONNECTION_TIMED_OUT  

Permissions
---
the extension require permissions of:

* alarms
* webRequest
* proxy  
* storage
* http://*/*
* https://*/*

webRequest and http/https are required for extension to inspect both http and https request.  
proxy ,of course, allows the extension to access chrome the proxy functionality. 
storage use to sync proxy list to both local and cloud. the latter one required it.but former one is need not.  
alarms are recommended replacement of time schedule API in chrome. in this case,sync list & optimize list work  
are schedule using this API.

License
---
BSD 4-clause license.  
