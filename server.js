//  OpenShift sample Node application

var express = require('express');
var app = express();
var fs = require("fs");
var https = require('https');
var http = require('http');
var md5 = require('md5');
var Keysession = "badae6cf02734ac34c50cb58d3877d39";
var apiKey =  "badae6cf02734ac34c50cb58d3877d39";
var pathApi = "";
var hostApi = 'webservice.laposte.fr';
/*************/
/* cgi proxy */
/*************/
//var HttpsProxyAgent = require('https-proxy-agent');
var HttpProxyAgent = require('http-proxy-agent');
/*************/
var numPhase = 0;
var nbTentativeConnexion = 0;
var paramId  = 0;
// caching time in second
var cachingTime = 60000;
var codeAcore = "";
var getOnlyHoraire = false;
var DISFEObject = null;
var start = new Date();

/**
 *  Define the sample application.
 */
var SampleApp = function()

{

    //  Scope.
    var self = this;


    /*  ================================================================  */
    /*  Helper functions.                                                 */
    /*  ================================================================  */

    /**
     *  Set up server IP address and port # using env variables/defaults.
     */
    self.setupVariables = function()
    {
        //  Set the environment variables we need.
        self.ipaddress = process.env.OPENSHIFT_NODEJS_IP ||
                         process.env.OPENSHIFT_INTERNAL_IP;
        self.port      = process.env.OPENSHIFT_NODEJS_PORT   ||
                         process.env.OPENSHIFT_INTERNAL_PORT || 8091;

        if (typeof self.ipaddress === "undefined") {
            //  Log errors on OpenShift but continue w/ 127.0.0.1 - this
            //  allows us to run/test the app locally.
            console.warn('No OPENSHIFT_*_IP var, using 127.0.0.1');
            self.ipaddress = "127.0.0.1";
        };
    };




    /**
     *  Populate the cache.
     */
    self.populateCache = function() {
        if (typeof self.zcache === "undefined") {
            self.zcache = { 'index.html': '' };
        }

        //  Local cache for static content.
        self.zcache['index.html'] = fs.readFileSync('./index.html');
    };


    /**
     *  Retrieve entry (content) from cache.
     *  @param {string} key  Key identifying content to retrieve from cache.
     */
    self.cache_get = function(key) { return self.zcache[key]; };


    /**
     *  terminator === the termination handler
     *  Terminate server on receipt of the specified signal.
     *  @param {string} sig  Signal to terminate on.
     */
    self.terminator = function(sig){
        if (typeof sig === "string") {
           console.log('%s: Received %s - terminating sample app ...',
                       Date(Date.now()), sig);
           process.exit(1);
        }
        console.log('%s: Node server stopped.', Date(Date.now()) );
    };


    /**
     *  Setup termination handlers (for exit and a list of signals).
     */
    self.setupTerminationHandlers = function(){
        //  Process on exit and signals.
        process.on('exit', function() { self.terminator(); });

        // Removed 'SIGPIPE' from the list - bugz 852598.
        ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT',
         'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGTERM'
        ].forEach(function(element, index, array) {
            process.on(element, function() { self.terminator(element); });
        });
    };


    /*  ================================================================  */
    /*  App server functions (main app logic here).                       */
    /*  ================================================================  */

    /**
     *  Create the routing table entries + handlers for the application.
     */
    self.createRoutes = function() {
        self.routes = { };

        // Routes for /health, /asciimo, /env and /
        self.routes['/health'] = function(req, res) {
            res.send('1');
        };


        self.routes['/api/acores/siteAcore/filtreGuichet/:codeAcore/:id'] = function (req, res)
        {

// verification que la requete contient bien les paramatres attendus
            if((req.params.id.length > 0 && req.params.id > 0)  && (req.params.codeAcore.length > 0)) {
                paramId = req.params.id;
                getOnlyHoraire = false;
                codeAcore = req.params.codeAcore;
                start = new Date();
                pathApi = '/api/acores/bureau_detail/'+codeAcore+'?id='+paramId+'&session='+apiKey;
                DISFEObject = setTemplateDIFSE();
                performResponse(res,0,"");
            }
        };

        self.routes['/api/acores/siteAcore/horaires/:codeAcore/:id']= function (req, res)
        {

// verification que la requete contient bien les paramatres attendus
            if((req.params.id.length > 0 && req.params.id > 0)  && (req.params.codeAcore.length > 0)) {
                paramId = req.params.id;
                getOnlyHoraire = true;
                codeAcore = req.params.codeAcore;
                start = new Date();
                pathApi = '/api/acores/bureau_detail/'+codeAcore+'?id='+paramId+'&session='+apiKey;
                DISFEObject = setTemplateDIFSE();
                performResponse(res,0,"");
            }
        };

        self.routes['/asciimo'] = function(req, res) {
            var link = "http://i.imgur.com/kmbjB.png";
            res.send("<html><body><img src='" + link + "'></body></html>");
        };

        self.routes['/env'] = function(req, res) {
            var content = 'Version: ' + process.version + '\n<br/>\n' +
                          'Env: {<br/>\n<pre>';
            //  Add env entries.
            for (var k in process.env) {
               content += '   ' + k + ': ' + process.env[k] + '\n';
            }
            content += '}\n</pre><br/>\n'
            res.send('<html>\n' +
                     '  <head><title>Node.js Process Env</title></head>\n' +
                     '  <body>\n<br/>\n' + content + '</body>\n</html>');
        };

        self.routes['/'] = function(req, res) {
            res.set('Content-Type', 'text/html');
            res.send(self.cache_get('index.html') );
        };
    };


    /**
     *  Initialize the server (express) and create the routes and register
     *  the handlers.
     */
    self.initializeServer = function() {
        self.createRoutes();
        self.app = express();

        //  Add handlers for the app (from the routes).
        for (var r in self.routes)
        {
            self.app.get(r, self.routes[r]);
        }
    };


    /**
     *  Initializes the sample application.
     */
    self.initialize = function()
    {
        self.setupVariables();
        self.populateCache();
        self.setupTerminationHandlers();

        // Create the express server and routes.
        self.initializeServer();
    };


    /**
     *  Start the server (starts up the sample application).
     */
    self.start = function()
    {
        //  Start the app on the specific interface (and port).
        self.app.listen(self.port, self.ipaddress, function()
        {
            console.log('%s: Node server started on %s:%d ...', Date(Date.now() ), self.ipaddress, self.port);
        });
    };

    console.log("HELLO");

   /* app.get('/api/acores/siteAcore/filtreGuichet/:codeAcore/:id', function (req, res) {

// verification que la requete contient bien les paramatres attendus
        if((req.params.id.length > 0 && req.params.id > 0)  && (req.params.codeAcore.length > 0)) {
            paramId = req.params.id;
            getOnlyHoraire = false;
            codeAcore = req.params.codeAcore;
            start = new Date();
            pathApi = '/api/acores/bureau_detail/'+codeAcore+'?id='+paramId+'&session='+apiKey;
            DISFEObject = setTemplateDIFSE();
            performResponse(res,0,"");
        }
    })*/


//**************************************************************************
// CG : 06-11-2014 Url API de récuperation horaire par Id bureau sur Acore v1 v2
// Parametres  { codeAcore : codeAcore/(String), id : idBureauPoste/(Num) }
//**************************************************************************



//**************************************************************************
// CG : 10-11-2014 Lancement serveur Node en ecoute sur Port: 8082
//**************************************************************************

  /*  var server = app.listen(8082, function ()
    {
        var host = "localhost"
        var port = server.address().port

        console.log("App listening at http://%s:%s", host, port)

    })*/



//**************************************************************************
// CG : 09-11-2014 Function de changement de phase pour les 4 requetes
// Parametres { response : response/(Result), numPhase : numero de phase/(Num), data : data/(Json) }
//**************************************************************************

    function performResponse(response,numPhase,data,iscached){
        console.info("********* phase "+numPhase+" **********"+'\n\n');
        switch (numPhase) {
            // Tentative de connexion Acore V1
            case 0:
                console.info("********* acore v1 connexion **********"+'\n\n');
                pathApi = '/api/acores/bureau_detail/'+codeAcore+'?id='+paramId+'&session='+apiKey;
                performRequest(response,numPhase,1);
                break;
            // Tentative de récuperation Json Acore V1
            case 1:
                console.info("********* acore v1 data **********"+'\n\n');
                nbTentativeConnexion = 0;
                setDataAcoreV1(response,data,iscached);
                apiKey = 'badae6cf02734ac34c50cb58d3877d39';
                // hostApi = 'www.laposte.fr';
                pathApi = '/api/acores/bureau_detail_v2/'+codeAcore+'?id='+paramId+'&session='+apiKey+'&use_http_status_code=0';
                performRequest(response,numPhase+1,2);
                break;
            // Tentative de connexion Acore V2
            case 2:
                console.info("********* acore v2 connexion **********"+'\n\n');
                pathApi = '/api/acores/bureau_detail_v2/'+codeAcore+'?id='+paramId+'&session='+apiKey+'&use_http_status_code=0';
                console.info('http://www.laposte.fr'+pathApi+'\n\n');
                performRequest(response,numPhase,2);
                break;
            // Tentative de récuperation Json Acore V2
            case 3:
                console.info("********* acore v2 data **********"+'\n\n');
                nbTentativeConnexion = 0;
                setDataAcoreV2(response,data,iscached);
                if(!getOnlyHoraire){
                    response.write(JSON.stringify(DISFEObject));
                }else{
                    response.write(JSON.stringify(DISFEObject.horaires));
                }
                response.end();
                var end = new Date() - start;
                console.info("Execution time: %dms", end);
                break;
        }


    }

//**************************************************************************
// CG : 10-11-2014 Function de traitement data Acore V1
// Parametre { Res : Result(Result), data : data/(Json) }
//**************************************************************************

    function setDataAcoreV1(res,data,iscached){
        //console.info(data.toString());
        try{
            // stockage cache
            if(!iscached){
                fs.writeFile('tmp/cache/json_'+codeAcore+'_id_'+paramId+'_version_'+1, data, function (err) {
                    if (err) return console.log(err);
                    console.log('tmp/cache/json_'+codeAcore+'_id_'+paramId+'_version_'+1+' is now cached');
                });
            }
            //if(!getOnlyHoraire){
            var obj = JSON.parse(data);
            DISFEObject.codeRegate = obj.bureaux.codeRegate;
            console.info('{"codeRegate": "'+obj.bureaux.codeRegate+'"}'+'\n\n');
            //}
            //res.write('{"codeRegate": "'+obj.bureaux.codeSite+'"}');

        }catch(e){
            res.write("erreur traitement Json Acore v1 :"+e);
            console.info("erreur traitement Json Acore v1 : "+e);
            res.end();
        }

    }


//**************************************************************************
// CG : 10-11-2014 Function de traitement data Acore V2
// Parametre { Res : Result/(Result), data : data/(Json) }
//**************************************************************************

    function setDataAcoreV2(res,data,iscached){

        try{
            if(!iscached){
                fs.writeFile('tmp/cache/json_'+codeAcore+'_id_'+paramId+'_version_'+2, data, function (err) {
                    if (err) return console.log(err);
                    console.log('tmp/cache/json_'+codeAcore+'_id_'+paramId+'_version_'+2+' is now cached');
                });
            }
            var obj = JSON.parse(data);

            if(!getOnlyHoraire){


                DISFEObject.codeAcores = codeAcore;
                DISFEObject.libelleCourt = obj.bureaux[codeAcore].general.libelleSite;
                DISFEObject.libelleLong = obj.bureaux[codeAcore].general.libelleSite;
                DISFEObject.codLongitude = obj.bureaux[codeAcore].general.lng;
                DISFEObject.codLatitude = obj.bureaux[codeAcore].general.lat;

                // adresse geo
                var  adresseGeo = new Object();
                adresseGeo.cplAdresse  = obj.bureaux[codeAcore].general.complementAdresse;
                adresseGeo.libAdresse = obj.bureaux[codeAcore].general.adresse;
                adresseGeo.lieuDit = obj.bureaux[codeAcore].general.lieuDit;
                adresseGeo.codePostal = obj.bureaux[codeAcore].general.codePostal;
                adresseGeo.libAcheminement = null;
                adresseGeo.pays = null;
                DISFEObject.adresseGeo = adresseGeo;

                // adresse postal
                var adressePostale = new Object();
                adressePostale.cplAdresse = obj.bureaux[codeAcore].general.complementAdresse;
                adressePostale.libAdresse = obj.bureaux[codeAcore].general.adresse;
                adressePostale.lieuDit = obj.bureaux[codeAcore].general.lieuDit;
                adressePostale.codePostal = obj.bureaux[codeAcore].general.codePostal;
                adressePostale.libAcheminement = null;
                adressePostale.pays = null;
                DISFEObject.adressePostale = adressePostale;

                DISFEObject.services = obj.bureaux[codeAcore].services;
                DISFEObject.accessibilite = obj.bureaux[codeAcore].accessibilite;

            }

            console.log(JSON.stringify(DISFEObject));

            DISFEObject.horaires = getHoraires(obj.bureaux[codeAcore].horaires,codeAcore,DISFEObject.codeRegate);


        }catch(e){

            res.write("erreur traitement Json Acore v2 :"+e);
            console.info("erreur traitement Json Acore v2 : "+e);
            res.end();
        }

    }

//**************************************************************************
// CG : 10-11-2014 Function de creation d'un objet DIFSE
// Retour : Object DIFSE(vide)
//**************************************************************************
    function setTemplateDIFSE(){

        var DifseReponse = {
            codeAcores:"null",
            codeRegate:"null",
            libelleCourt:null,
            libelleLong:null,
            codTypSitAc:null,
            libTypSitAc:null,
            codSitAcoresRattach:"",
            emails:[],
            idZoneGeoTVA:null,
            codLongitude:"",
            codLatitude:"",
            adresseGeo:null,
            adressePostale:null,
            pointDeStockListe:[],
            hld:[],
            telephones:[],
            caracteristiques:[],
            equipements:[],
            amenagements:[],
            automates:[],
            horaires:[],
            services:null,
            accessibilite:null
        };

        return DifseReponse;

    }

    function getHoraires(horairesV2,codeAcore,codeRegate){

        console.info("try getting horaires");
        try{
            var horaires = horairesV2;
            var tabHoraireFormatted = new Array();

            for (var horaire in horaires) {
                if (horaires.hasOwnProperty(horaire)) {
                    console.info(horaire + " -> " + horaires[horaire].horaires.length);
                    //   console.info("gethoraire : "+horaires[horaire].horaires.toString());
                    var oneHoraire = new Object();
                    oneHoraire.codSitAcores = codeAcore;
                    oneHoraire.codEntRegate = codeRegate;
                    oneHoraire.datJour = horaire;

                    if(horaires[horaire].horaires.length  !== 0){

                        oneHoraire.codTypService = null;

                        try{
                            oneHoraire.hldCour = horaires[horaire].heures_limites.lettres[1];
                        }catch(e){
                            oneHoraire.hldCour = null;
                        }
                        try{
                            oneHoraire.hldChro = horaires[horaire].heures_limites.chrono[1];
                        }catch(e){
                            oneHoraire.hldChro = null;
                        }
                        try{
                            oneHoraire.hldColi = horaires[horaire].heures_limites.colis[1];
                        }catch(e){
                            oneHoraire.hldColi = null;
                        }

                        for (i = 1; i <= 7; i++) {
                            if(i <= horaires[horaire].horaires.length){
                                oneHoraire['plageHor'+i] = horaires[horaire].horaires[i-1];
                            }else{
                                oneHoraire['plageHor'+i] = null;
                            }

                        }

                        oneHoraire.libFermeture = null;
                        oneHoraire.codTypConAct = null;
                        oneHoraire.codTypEtaAct = null;
                        oneHoraire.codSitTrfAct = null;



                    }else{


                        oneHoraire.codTypService = null;
                        for (i = 1; i <= 7; i++) {
                            oneHoraire['plageHor'+i] = null;
                        }
                        oneHoraire.hldCour = null;
                        oneHoraire.hldChro = null;
                        oneHoraire.hldColi = null;
                        oneHoraire.libFermeture = null;
                        oneHoraire.codTypConAct = null;
                        oneHoraire.codTypEtaAct = null;
                        oneHoraire.codSitTrfAct = null;

                    }

                    tabHoraireFormatted.push(oneHoraire);

                }

            }


            return tabHoraireFormatted;

        }catch(e){

            res.write("erreur traitement horaire Acore v2 :"+e);
            console.info("erreur traitement horaire Acore v2 : "+e);
            res.end();
        }
    }





//**************************************************************************
// CG : 06-11-2014 Function d'envoi de requete API
// Parametre { Res : Result/(Result), Phase : NumeroDePhase/(Num), numVersionApi : VersionAPI(number)}
//**************************************************************************


    function performRequestNotCached(res,phase,versionApi){


        /**********************************************/
        /***************** cgi proxy ******************/
        /**********************************************/
        var proxy = 'http://fr-proxy.groupinfra.com:3128';
        var agent = new HttpProxyAgent(proxy);
        /**********************************************/

        console.info("pas de cache generation");
// parametre de connexion
        var options = {
            host: hostApi,
            path: pathApi,
            encoding: 'UTF-8',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control':'max-age=60'
            },
          //  agent: agent,
            port:80
        };


        var reqGet = http.request(options, function(result) {


            var chunks = [];
            // Recuperation des Partials Data
            result.on('data', function(chunk) {
                chunks.push(chunk);
            });

            // Fin de reception des Partials data Concatenation et Traitement
            result.on('end', function () {


                if(nbTentativeConnexion < 3){

                    var stringBuffer  = Buffer.concat(chunks);
                    // reception d'une erreur d'authentification "401" , recuperation Token et generation clef de session ( Acore v1 )
                    if(result.statusCode == "401" ){
                        try{
                            var obj = JSON.parse(stringBuffer);
                            apiKey = md5(Keysession+obj.token);
                            console.info(" generation apiKeySession Acore V1 : "+md5(Keysession+obj.token)+'\n\n');
                            nbTentativeConnexion++;
                            performResponse(res,phase,stringBuffer,false);

                        }catch(e){
                            res.write("erreur en phase d'authentification V1 :"+e);
                            console.info("erreur en phase d'authentification V1 : "+e);
                            res.end();

                        }

                        // reception resultat de la requete sans erreur
                    }else if(result.statusCode == "200"){

                        // verification de la presence d'un statusCode 401 dans la reponse Json
                        try{

                            if(JSON.parse(stringBuffer).hasOwnProperty('statusCode') == true){
                                if(JSON.parse(stringBuffer).statusCode == "401"){
                                    // recuperation Token generation clef de session ( Acore V2 )
                                    var obj = JSON.parse(stringBuffer);
                                    apiKey = md5(Keysession+obj.token);
                                    console.info(" generation apiKeySession Acore v2 : "+md5(Keysession+obj.token)+'\n\n');
                                    nbTentativeConnexion++;
                                    performResponse(res,phase,stringBuffer,false);
                                }
                            }else{

                                performResponse(res,(phase+1),stringBuffer,false);
                            }
                        }catch(error){

                            res.write("erreur en phase d'authentification V2"+error);
                            console.info("erreur en phase d'authentification V2"+error);
                            res.end();

                        }

                    }else{
                        // Autre status
                        res.write("erreur status code non attendu"+result.statusCode);
                        console.info("erreur status code non attendu"+result.statusCode);
                        res.end();
                    }

                }else{
                    res.write("pas de reponse valide AcoreV1 ou AcoreV2 dans le temps imparti ( codeAcore ou id invalide ? ) ");
                    res.end();
                    nbTentativeConnexion = 0;
                }


            });




        });

        reqGet.end();
        reqGet.on('error', function(e) {
            console.error(e);
        });



    }




//**************************************************************************
// CG : 06-11-2014 Function d'envoi de requete API / verification presence en cache
// Parametre { Res : Result/(Result), Phase : NumeroDePhase/(Num), numVersionApi : VersionAPI(number)}
//**************************************************************************

    function performRequest(res,phase,versionApi){



        console.info("tentative de connexion sur : "+hostApi+pathApi+'\n\n');
        console.info("********* phase recu "+phase+" **********"+'\n\n');
// verification presence en cache du json
        var iscachedData = false;
        if(phase == 0 || phase == 2){
            var fs = require('fs');
            fs.readFile(('tmp/cache/json_'+codeAcore+'_id_'+paramId+'_version_'+versionApi), function(errorreadfile, datafile) {
                if (errorreadfile) {

                    performRequestNotCached(res,phase,versionApi);

                    console.info(errorreadfile);
                }else{

                    fs.stat(('tmp/cache/json_'+codeAcore+'_id_'+paramId+'_version_'+versionApi), function(errorstat, data) {
                        if (errorstat) {
                            console.info(errorstat);
                        }else{

                            // fichier existant et date recupere
                            var now = new Date();
                            console.info(now.getTime()+" _ "+Date.parse(data.mtime));
                            console.info("TimeBetween : "+(now.getTime()-Date.parse(data.mtime)));
                            if((now.getTime() - Date.parse(data.mtime)) < (cachingTime*1000)){

                                iscachedData = true;
                                console.info("fichier trouvé et à jour");
                                if(phase == 0){
                                    performResponse(res,1,datafile,true);
                                }else if(phase == 2){
                                    performResponse(res,3,datafile,true);
                                }
                            }else{
                                performRequestNotCached(res,phase,versionApi);
                            }

                        }

                    });


                }

            });

        }




    }






};   /*  Sample Application.  */



/**
 *  main():  Main code.
 */
var zapp = new SampleApp();
zapp.initialize();
zapp.start();

