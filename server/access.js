var path=require('path'), fs=require('fs');
var log=require("./server").log,
    getServerConfig=require("./server").getServerConfig,
    database=require("./databaseMSSQL"),
    common=require("./common");

module.exports= function(app) {
    var reqIsJSON = function (headers) {
        return (headers && headers["x-requested-with"] && headers["x-requested-with"] == "application/json; charset=utf-8")
    };
    var reqIsAJAX = function (headers) {
        return (headers && headers["content-type"] == "application/x-www-form-urlencoded" && headers["x-requested-with"] == "XMLHttpRequest");
    };
    app.use(function (req, res, next) {                     log.info("ACCESS CONTROLLER  req.path=", req.path, " params:",req.query,{});
        if (req.originalUrl.indexOf("/login") >= 0) {
            next();
            return;
        }
        if (req.cookies.uuid) {
            var uuid=req.cookies.uuid;
            var connData=database.getConnData();
            if(connData && connData[uuid] && connData[uuid].connection
                && connData[uuid].user) {
                database.selectQuery(uuid,"select SUSER_NAME() as dbUserName;",function(err, recordset){
                    if(err){
                        log.error('Failed to get current DB user. Reason: '+err);
                        return;
                    }
                    log.info('Current DB user: ', recordset[0].dbUserName);
                    req.uuid = uuid;
                    req.dbUserName=recordset[0].dbUserName;

                    if(database.getSystemConnectionErr() && !req.cookies.sysadmin){
                        var img = "imgs/girls_big.jpg";
                        var title = "REPORTS";
                        var icon32x32 = "icons/profits32x32.jpg";
                        res.render(path.join(__dirname, "../pages/dbFailed.ejs"), {
                            title: title,
                            bigImg: img,
                            icon: icon32x32,
                            errorReason: "Не удалось обратиться к базе данных!"
                        });
                        return;
                    }
                    next();
                });
                return;
            }
            if(req.cookies.sysadmin){
                var sysAdminUUIDArr = common.getSysAdminConnArr();
                for (var i in sysAdminUUIDArr) {
                    if (sysAdminUUIDArr[i][req.cookies.uuid]) {
                        if(database.getSystemConnectionErr()){
                            if(req.originalUrl.indexOf("/sysadmin") < 0) res.redirect('/sysadmin');
                            next();
                            return;
                        }
                        if (reqIsJSON(req.headers) || reqIsAJAX(req.headers)) {
                            log.info("DB connection config was changed or connections were cleared. New authorisation is needed.");
                            res.send({
                                error: "DB connection config was changed or connections were cleared. New authorisation is needed.",
                                userErrorMsg: "Необходимо повторно авторизироваться."
                            });
                            next();
                            return;
                        }
                        log.info("DB connection config was changed or connections were cleared. New authorisation is needed.");
                        res.render(path.join(__dirname, '../pages/login.ejs'), {
                            loginMsg: "<div>Необходимо повторно авторизироваться.</div>"
                        });
                        return;
                    }
                }
            }
            if (reqIsJSON(req.headers) || reqIsAJAX(req.headers)) {
                res.send({
                    error: "Failed to get data! Reason:the session has expired!",
                    userErrorMsg: "Не удалось плучить данные. Время сессии истекло."
                });
                return;
            }
            res.render(path.join(__dirname, '../pages/login.ejs'), {
                loginMsg: "<div>Время сессии истекло.<br> Необходима авторизация.</div>"
            });
            return;
        }
        if (reqIsJSON(req.headers) || reqIsAJAX(req.headers)) {
            res.send({
                error: "Failed to get data! Reason: user is not authorized!",
                userErrorMsg: "Не удалось плучить данные. Пользователь не авторизирован."
            });
            return;
        }
        res.render(path.join(__dirname, '../pages/login.ejs'), {
            loginMsg: ""
        });
    });

    app.get("/login", function (req, res) {                                                                 log.info("app.get /login");
        res.render(path.join(__dirname, '../pages/login.ejs'), {
            loginMsg: ""
        });
    });
    app.post("/login", function (req, res) {                                                                log.info("app.post /login",req.body.user, 'userPswrd=',req.body.pswrd);
        var userName=req.body.user, userPswrd=req.body.pswrd;
        if(!userName ||!userPswrd ){
            res.send({error:"Authorisation failed! No login or password!", userErrorMsg:"Пожалуйста введите имя и пароль."});
            return;
        }
        database.connectWithPool({login:userName,password:userPswrd}, function(err,recordset){
            var serverConfig=getServerConfig(),
                rootUser=serverConfig.user, rootPassword=serverConfig.password, isSysadmin=false;
            if(userName==rootUser && userPswrd==rootPassword) isSysadmin=true;
            if(err){
                if(isSysadmin){
                    var newUUID = common.getUIDNumber();
                    var sysadminsArray=common.getSysAdminConnArr();
                    var newSysAdminConn={};
                    newSysAdminConn[newUUID]=userName;
                    sysadminsArray.push(newSysAdminConn);
                    common.writeSysAdminLPIDObj(sysadminsArray);
                    res.cookie("uuid", newUUID);
                    res.send({result: "success"});
                    return;
                }else{
                    res.send({error:err});
                    return;
                }
            }
            var uuid=recordset.uuid;
            if(isSysadmin){
                var sysadminsArray=common.getSysAdminConnArr();
                var newSysAdminConn={};
                newSysAdminConn[uuid]=userName;
                sysadminsArray.push(newSysAdminConn);
                common.writeSysAdminLPIDObj(sysadminsArray);
            }
            res.cookie("uuid", uuid);
            res.send({result: "success"});
        });
    });
};