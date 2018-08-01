(function (root) {

    function returnRaw(source) {
        return source;
    }

    function checkArgs(args, declaration) {

    }


    function wrapDecodeFuncArgs(args) {
        for (var i = 0; i < args.length; i++) {
            if (typeof args[i] === 'function') {
                args[i] = wrapDecpdeFuncArg(args[i]);
            }
        }

        return args;
    }

    function wrapDecpdeFuncArg(fn) {
        return function (arg) {
            fn(JSON.parse(arg));
        };
    }

    function wrapArgFunc(args) {
        for (var i = 0; i < args.length; i++) {
            if (typeof args[i] === 'function') {
                args[i] = wrapFunc(args[i]);
            }
        }

        return args;
    }

    var funcId = 1;
    var FUNC_PREFIX = '__jsna_';

    function wrapFunc(fn) {
        var funcName = FUNC_PREFIX + (funcId++);

        root[funcName] = function (arg) {
            delete root[funcName];
            fn(arg);
        };

        return funcName;
    }


    function argEncode(args) {
        for (var i = 0; i < args.length; i++) {
            args[i] = JSON.stringify(args[i]);
        }

        return args;
    }

    function argCombine(args, declaration) {
        var result = {};

        for (var i = 0; i < declaration.length; i++) {
            var arg = args[i];
            if (arg != null) {
                result[declaration[i].name] = arg;
            }
        }

        return result;
    }



    var Processors = {
        ArgCheck: function (description, option) {
            return function (args) {
                checkArgs(args, description.args);
                return args;
            };
        },

        ArgFuncArgDecode: function (description, option) {
            return option === 'JSON'
                ? wrapDecodeFuncArgs
                : returnRaw;
        },
        
        ArgFuncEncode: function (description, option) {
            return wrapArgFunc;
        },
        
        ArgEncode: function (description, option) {
            return option === 'JSON'
                ? argEncode
                : returnRaw;
        },
        
        ArgAdd: function (description, option) {
            var argLen = description.args.length;

            description.args.push({
                name: '_' + option,
                type: '*'
            });

            var value = description[option];
            return function (args) {
                args[argLen] = value;
            };
        },
        
        ArgCombine: function (description, option) {
            switch (option) {
                case 'URL':
                    var prefix = description.schema + '/' + description.authority + description.path + '?';
                    return function (args) {
                        var result = [];

                        for (var i = 0; i < declaration.length; i++) {
                            var arg = args[i];
                            if (arg != null) {
                                result.push(declaration[i].name + '=' + arg);
                            }
                        }

                        return result.join('&');
                    };

                case 'Object':
                    return function (args) {
                        return argCombine(args, description.args);
                    };

                case 'JSONString':
                    return function (args) {
                        return JSON.stringify(argCombine(args, description.args));
                    };
            }

            return returnRaw;
        },
        
        CallMethod: function (description, option) {
            var method;
            function findMethod() {
                if (!method) {
                    var segs = description.method.split('.');
                    method = root;
                    for (var i = 0; i < segs.length; i++) {
                        method = method[segs[i]];
                    }
                }

                return method;
            }

            if (description.args.length < 5) {
                return function (args) {
                    var fn = findMethod;
                    fn(args[0], args[1], args[2], args[3]);
                };
            }

            return function (args) {
                var fn = findMethod;
                fn.apply(root, args);
            };
        },
        
        CallPrompt: function () {
            return callPrompt;
        },
        
        CallIframe: function (description, option) {
            return callIframe;
        },
        
        CallLocation: function (description, option) {
            return callLocation;
        },
        
        CallMessage: function (description, option) {
            return function (args) {
                root.webkit.messageHandlers[description.handler].postMessage(args);
            };
        },
        
        ReturnDecode: function (description, option) {
            return option === 'JSON'
                ? JSON.parse
                : returnRaw;
        }
    };

    function callPrompt(source) {
        return root.prompt(source);
    }

    function callLocation(url) {
        root.location.href = url;
    }

    function callIframe(url) {
        var iframe = document.createElement('iframe');
        iframe.src = url;
        document.body.appendChild(iframe);

        document.body.removeChild(iframe);
    }


    function APIContainer() {
        this.apis = [];
        this.apiIndex = {};
    }

    APIContainer.prototype.add = function (description) {
        if (description instanceof Array) {
            for (var i = 0; i < description.length; i++) {
                this.add(description[i]);
            }
        }
        else if (typeof description === 'object') {
            var name = description.name;

            if (this.apiIndex[name]) {
                throw new Error('[jsNative] API exists: ' + name);
            }

            this.apis.push(description);
            this.apiIndex[name] = description;
        }

        return this;
    };

    APIContainer.prototype.fromNative = function (description) {
        return this.add(jsNative.invoke(description));
    };

    APIContainer.prototype.map = function (mapAPI) {
        mapAPI = mapAPI || function (name) {
            return name
        };

        var apiObject = {};


        for (var i = 0; i < this.apis.length; i++) {
            var api = this.apis[i];
            var apiName = mapAPIName(mapAPI, api.name);

            if (apiName) {
                apiObject[apiName] = buildAPIMethod(api);
            }
        }

        return apiObject;
    };

    APIContainer.prototype.invoke = function (name, args) {
        return jsNative.invoke(this.apiIndex[name], args);
    };

    function mapAPIName(mapAPI, name) {
        if (typeof mapAPI === 'function') {
            return mapAPI(name);
        }

        return mapAPI[name];
    }

    function buildAPIMethod(description) {
        var proccessors = getProccessors(description);

        return function () {
            var args = Array.prototype.slice.call(arguments);
            for (var i = 0; i < proccessors.length; i++) {
                args = proccessors[i](args);
            }
        };
    }

    var INVOKE_SHORTCUT = {
        'method': [
            'ArgCheck',
            'CallMethod'
        ],

        'method.json': [
            'ArgCheck',
            'ArgFuncArgDecode:JSON',
            'ArgFuncEncode',
            'ArgEncode:JSON',
            'CallMethod',
            'ReturnDecode:JSON'
        ],

        'prompt.json': [
            'ArgCheck',
            'ArgFuncArgDecode:JSON',
            'ArgFuncEncode',
            'ArgAdd:name',
            'ArgCombine:JSONString',
            'CallPrompt',
            'ReturnDecode:JSON'
        ],


        'prompt.url': [
            'ArgCheck',
            'ArgFuncArgDecode:JSON',
            'ArgFuncEncode',
            'ArgEncode:JSON',
            'ArgCombine:URL',
            'CallPrompt',
            'ReturnDecode:JSON'
        ],


        'location': [
            'ArgCheck',
            'ArgFuncArgDecode:JSON',
            'ArgFuncEncode',
            'ArgEncode:JSON',
            'ArgCombine:URL',
            'CallLocation'
        ],

        'iframe': [
            'ArgCheck',
            'ArgFuncArgDecode:JSON',
            'ArgFuncEncode',
            'ArgEncode:JSON',
            'ArgCombine:URL',
            'CallIframe'
        ],

        'message': [
            'ArgCheck',
            'ArgFuncArgDecode:JSON',
            'ArgFuncEncode',
            'ArgAdd:name',
            'ArgCombine:Object',
            'CallMessage'
        ]
    };

    var INVOKE_CALL_MAP = {
        method: 'CallMethod',
        prompt: 'CallPrompt',
        location: 'CallLocation',
        iframe: 'CallIframe',
        message: 'CallMessage'
    };

    var INVOKE_BEFORE_MAP = {
        JSONStringInTurn: [
            'ArgFuncArgDecode:JSON',
            'ArgFuncEncode',
            'ArgEncode:JSON'
        ],

        JSONString:[
            'ArgFuncArgDecode:JSON',
            'ArgFuncEncode',
            'ArgAdd:name',
            'ArgCombine:JSONString'
        ],
        
        JSONObject:[
            'ArgFuncArgDecode:JSON',
            'ArgFuncEncode',
            'ArgAdd:name',
            'ArgCombine:Object'
        ],
        
        URL:[
            'ArgFuncArgDecode:JSON',
            'ArgFuncEncode',
            'ArgEncode:JSON',
            'ArgCombine:URL'
        ]
    };

    function getProccessors(description) {
        var invoke = description.invoke || [];
        if (!invoke instanceof Array) {
            switch (typeof invoke) {
                case 'string':
                    invoke = INVOKE_SHORTCUT[invoke] || [];
                    break;

                case 'object':
                    invoke = [];

                    if (invoke.check) {
                        invoke.push('ArgCheck');
                    }

                    if (invoke.before) {
                        invoke = invoke.concat(INVOKE_BEFORE_MAP[invoke.before]);
                    }

                    invoke.push(INVOKE_CALL_MAP[invoke.call]);

                    if (invoke.after === 'JSON') {
                        invoke.push('ReturnDecode:JSON');
                    }
                    break;

                default:
                    invoke = [];

            }
        }

        var processors = [];
        for (var i = 0; i < invoke.length; i++) {
            var processName = invoke[i];
            var dotIndex = processName.indexOf('.');
            var option = null;

            if (dotIndex > 0) {
                option = processName.slice(dotIndex + 1);
                processName = processName(0, dotIndex);
            }

            var processor = Processors[processName](description, option);
            if (typeof processor === 'function') {
                processors.push(processor)
            }
        }
    }

    function jsNative() {
        return new APIContainer();
    }

    jsNative.invoke = function (description, args) {
        var proccessors = getProccessors(description);
        for (var i = 0; i < proccessors.length; i++) {
            args = proccessors[i](args);
        }
    };

    this.jsNative = jsNative;

    // For AMD
    if (typeof define === 'function' && define.amd) {
        
        define('jsNative', [], jsNative);
    }

})(this);