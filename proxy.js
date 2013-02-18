/*
Copyright (c) <2013>, <Zizon Qiu zzdtsv@gmail.com>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.
3. All advertising materials mentioning features or use of this software
   must display the following acknowledgement:
   This product includes software developed by the <organization>.
4. Neither the name of the <organization> nor the
   names of its contributors may be used to endorse or promote products
   derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY <COPYRIGHT HOLDER> ''AS IS'' AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
"use strict";

var config = {
    "servers":"SOCKS5 127.0.0.1:10086;"
}

var engine = {
    "gen":function(hints){
        // build lookup
        var lookup = hints.genLookup();
		var marks = hints.marks;
        
        var servers = config["servers"] + ";DIRECT;";
        
		var matchFuzzy = hints.match;
		
        //gen template
        var template = function(url,host){
            if( host in marks ){
                return servers;
            }
			
			return matchFuzzy(host,lookup,false)["fuzzy"] ? servers : "DIRECT;";
        }
        
        return "var lookup = " + JSON.stringify(lookup) + ";\n"
            +   "var marks = " + JSON.stringify(marks) + ";\n"
            +   "var servers = '" + servers + "'\n"
			+	"var matchFuzzy = " + matchFuzzy.toString() + "\n"
            +   "var FindProxyForURL = " + template.toString(); 
    }
}

var hints ={
    "marks":{},
	
	"complete":{},
	
	"genLookup":function(){
		var lookup = {};
		var marks = this.marks;
        for(var key in marks){
            if( marks[key] <= 0 ){
                delete marks[key];
                continue;
            }
            
            key.split(".").reduceRight(function( previous, current, index, array ){
                        return current in previous ? previous[current] : previous[current] = {};
                },
                lookup
            );
        }
		
		return lookup;
	},
	
	"match":function(host,lookup,create_when_miss){
		return host.split(".").reduceRight(function( previous, current, index, array ){
				// if already meet a fuzzy,ignore
				if( previous["fuzzy"] || previous["giveup"] ){
					return previous;
				}
					
				var lookup = previous["lookup"];
					
				// see if current context has fuzzy
				if( "*" in lookup ){
					// mark it
					previous["fuzzy"] = true;
					
					// save match context
					previous["context"].push("*");
					return previous;
				}
					
				if( current in lookup ){
					// match , deep down
					previous["lookup"] = lookup[current];
					previous["context"].push(current);
					return previous;
				}
				
				// not match,
				if( create_when_miss ){
					previous["lookup"] = lookup[current] = {};
					previous["context"].push(current);
					return previous;
				}else{
					previous["giveup"] = true;
					return previous;
				}
			},
			{
				"lookup":lookup,
				"fuzzy":false,
				"giveup":false,
				"context":[]
			}
		);
	},
	
    "compact":function(){
        // easy job
        if( "*" in this.marks ){
            this.marks = {"*":2};
            return;
        }
        
		// lookup table
        var lookup = {};

		// eliminate
		var this_hints = this;
		var eliminate = function( context, current_lookup ){
			for( var key in current_lookup ){
				// ignore fuzzy itself
				if( key == "*" ){
					continue;
				}
				
				// sweep children
				context.push(key);
				eliminate(context,current_lookup[key]);
				delete this_hints.marks[context.reverse().join(".")];
				context.reverse();
				context.pop();
			}
		}
		
        for( var key in this.marks ){
            if( this.marks[key] <= 0 ){
                delete this.marks[key];
                continue;
            }
			
			var match = this.match(key,lookup,true);
			
			// match fuzzy
			if( match["fuzzy"] ){
				// it is not fuzzy,delete it
				if( key.indexOf("*") == -1 ){
					delete this.marks[key];
					continue;
				}
				
				// or eliminate not fuzzy
				
				var stack = match["context"];
				var current = match["lookup"];
		
				// loop each child and deep down.
				// delete all of it.
				for( var key in current ){
					// optimize case,ignore fuzzy
					if( key != "*" ){
						stack.push(key);
						eliminate(stack,current[key]);
						stack.pop();
					}
				}
			}
        }
    },
    
    "markOK":function(host){
        if( host in this.complete ){
            if( this.complete[host] < Number.MAX_VALUE ){
                this.complete[host]++;
            }
        }else{
			this.complete[host] = 1;
		}
    },
    
    "codegen":function(){
        chrome.alarms.get("codegen",function(alarm){
            if( alarm == undefined ){
                console.log("async codgen")
                chrome.alarms.create(
                    "codegen",
                    {
                        "when":Date.now()+500
                    }
                );
            }
        })
    },
    
    "markFail":function(host){
            // if host is in proxy.
			// update marks
            if( host in this.marks ){
                if( --this.marks[host] <= 0 ){
					// proxy fail much,remove from proxy
                    delete this.marks[host];
                    this.codegen();
                }
            }else{
				// not in proxy yet,add it
                this.marks[host] = 2;
                this.codegen();
            }
    }
}

function syncFromCloud(){
    console.log("sync from cloud");
    chrome.storage.sync.get(null,function(items){
        var marks = hints.marks;
        for(var key in items){
            marks[key] = items[key];
        }
    });
}

function resoreHints(){
    console.log("restore hints");
    var cache = localStorage.getItem("hints.marks");
    if( cache == null ){
        return;
    }
    
    cache = JSON.parse(cache);
    for( key in cache ){
        hints.marks[key] = cache[key];
    }
    
	hints.compact();
    hints.codegen();
}

function extractHost(url){
    var start = url.indexOf("://") + 3;
    return url.substr(start,url.indexOf("/",start) - start);
}

function handInRequest(){
    console.log("handin request");
    
    chrome.proxy.onProxyError.addListener(function(details){
        console.error("proxy error:" + details);
    });
    
    chrome.webRequest.onErrorOccurred.addListener(
        function(details){
            console.error(details);
            
            // inspect potential reset request
            switch(details.error){
                default:
                    return;
                case "net::ERR_CONNECTION_RESET":
                case "net::ERR_CONNECTION_ABORTED":
                case "net::ERR_CONNECTION_TIMED_OUT":
					hints.markFail(extractHost(details.url));
                    break;
            }
        },
        {
            "urls":["<all_urls>"]
        }
    );
    
    chrome.webRequest.onCompleted.addListener(
        function(details){
            // ignore cache
            if(details.fromCache){
                return;
            }
            
            // mark host ok
            hints.markOK(extractHost(details.url));
        },
        {
            "urls":["<all_urls>"]
        },
        []
    );
}

function schedule(){
    console.log("schedule");
    chrome.alarms.create(
        "sync-to-cloud",
        {
            "periodInMinutes":30
        }
    );
    
    chrome.alarms.create(
        "sweep-hints-marks",
        {
            "periodInMinutes":5
        }
    );
    
    chrome.alarms.onAlarm.addListener(function( alarm ){
        console.log("fire alarm:" + alarm.name);
        switch(alarm.name){
			case "codegen":
                chrome.proxy.settings.clear({});


                chrome.proxy.settings.set(
                    {
                        "value":{
                            "mode":"pac_script",
                            "pacScript":{
                                "mandatory":true,
                                "data":engine.gen(hints)
                            }
                        }
                    },
                    function(){
                        console.log("setting apply");
                    }
                );

                break;
            case "sync-to-cloud":
                chrome.storage.sync.set(hints["marks"],function(){
                    console.log("sync to cloud");
                });
                break
            case "sweep-hints-marks":
				// compact first,make it shorter
				hints.compact();
				
				// loop hints.complete list,
				// update counter in marks.
				var lookup = hints.genLookup();
				for( var key in hints.complete ){
					var match = hints.match(key,lookup,true);
					if( match["fuzzy"] ){
						hints.marks[match["context"].reverse().join(".")] += hints.complete[key];
					}
				}
				
				// clear
				hints.complete = {};
				
				console.log("sync-local-cache");
				localStorage.setItem("hints.marks",JSON.stringify(hints.marks));
                break;
        }
    });
}

function handIn(){
    syncFromCloud();
    resoreHints();
    handInRequest();
    schedule();
}

(function(){
	handIn();
})();