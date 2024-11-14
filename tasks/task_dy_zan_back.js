let tCommon = require('app/dy/Common.js');
let DyUser = require('app/dy/User.js');
let DyVideo = require('app/dy/Video.js');
let storage = require('common/storage.js');
let machine = require('common/machine.js');
let baiduWenxin = require('service/baiduWenxin.js');
let statistics = require('common/statistics');
let V = require("version/V.js");

// let dy = require('app/iDy');
// let config = require('config/config');

/**
 * 赞回访
 */

let videoCount = 500;

let task = {
    contents: [],
    run() {
        return this.testTask();
    },

    log() {
        let d = new Date();
        let file = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
        let allFile = "log/log-dy-zan-back-" + file + ".txt";
        Log.setFile(allFile);
    },

    //type 0 评论，1私信
    getMsg(type, title, age, gender) {
        if (storage.get('setting_baidu_wenxin_switch', 'bool')) {
            return { msg: type === 1 ? baiduWenxin.getChat(title, age, gender) : baiduWenxin.getComment(title) };
        }
        return machine.getMsg(type) || false;//永远不会结束
    },

    getConfig() {
        return {
            runTimes: machine.get('task_dy_zan_back_run_count', 'int'),//运行次数
            intevalSecond: machine.get('task_dy_zan_back_interval', 'int'),//操作间隔
            homeWait: machine.get('task_dy_zan_back_home_wait', 'int') || 5,//主页停留时间
            workWait: machine.get('task_dy_zan_back_work_wait', 'int') || 5,//作品停留时间
            fansMin: machine.get('task_dy_zan_back_min_fans', 'int') || 0, //最小粉丝数
            fansMax: machine.get('task_dy_zan_back_max_fans', 'int') || 1000000000,//最大粉丝数
            workMin: machine.get('task_dy_zan_back_min_work', 'int') || 1,//最小作品数
            op: machine.getArray('task_dy_zan_back_op'), // "0"，"1"，"2" 分别是 关注、私信、点赞
        }
    },

    testTask() {
        //查看是不是进入了指定页面，是的话才开始运行
        let config = this.getConfig();
        Log.log("配置信息：", config);
        tCommon.id(V.C.userListTop).isVisibleToUser(true).waitFindOne();

        let arr = [];//存储最新的20个
        let count = 0;
        let repeatCount = 0;
        let errorCount = 0;
        let errorContainsCount = 0;

        while (true) {
            try {
                tCommon.sleep(3000);
                System.toast('开始执行，剩余数量：' + (config.runTimes - count));
                let contains = tCommon.id(V.Comment.getList[0]).isVisibleToUser(true).find();
                Log.log("找到的内容数量：", contains.length);
                if (contains.length == 0) {
                    if (errorContainsCount++ >= 3) {
                        throw new Error("3次找不到container内容");
                    }
                    continue;
                }
                errorContainsCount = 0;

                for (let i in contains) {
                    tCommon.sleep(config.intevalSecond * 1000);
                    let nicknameTag = contains[i].children().findOne(tCommon.id(V.Video.zanList[0]).isVisibleToUser(true));
                    Log.log(nicknameTag);
                    if (!nicknameTag) {
                        System.generateWindowElements();
                        Log.log('找不到昵称标签', contains[i]);
                        if (errorCount++ > 3) {
                            errorCount = 0;
                            throw new Error("3次找不到昵称");
                        }
                        continue;
                    }
                    errorCount = 0;

                    tCommon.click(nicknameTag);
                    tCommon.sleep(2000);
                    statistics.viewUser();
                    let nickname = nicknameTag.text();
                    count++;
                    Log.log('操作次数：' + count + "/" + config.runTimes);
                    if (count >= config.runTimes) {
                        System.toast('运行次数达到了');
                        return true;
                    }

                    if (DyUser.isPrivate()) {
                        tCommon.back();
                        System.toast('私密账号');
                        continue;
                    }

                    let account = DyUser.getDouyin();
                    if (machine.get("task_dy_zan_back_" + account, 'bool')) {
                        tCommon.back();
                        System.toast('已经操作过了');
                        continue;
                    }

                    Log.log("抖音号：", account);
                    machine.set("task_dy_zan_back_" + account, true);
                    if (arr.indexOf(account) != -1) {
                        repeatCount++;
                        if (repeatCount >= 2) {
                            System.toast('运行结束');
                            return true;
                        }
                        tCommon.back();
                        continue;
                    } else {
                        repeatCount = 0;
                    }

                    arr.push(account);

                    let fansCount = DyUser.getFansCount();
                    Log.log("粉丝数量：", fansCount);
                    if (fansCount < config.fansMin || fansCount > config.fansMax) {
                        tCommon.back();
                        System.toast('粉丝数不符合要求');
                        continue;
                    }

                    let workCount = DyUser.getWorksCount();
                    Log.log("作品数量：", workCount);
                    if (workCount < config.workMin) {
                        tCommon.back();
                        System.toast('作品数不符合要求');
                        continue;
                    }

                    if (config.op.includes("2") && DyVideo.intoUserVideo()) {
                        Log.log("执行进入视频");
                        tCommon.sleep(config.workWait * 1000);
                        if (DyVideo.isZan()) {
                            System.toast('已经点赞了');
                        } else {
                            DyVideo.clickZan();
                            tCommon.sleep(1000 + 1000 * Math.random());
                        }
                        tCommon.back();
                    }

                    //查看是否关注
                    if (config.op.includes("0")) {
                        Log.log("执行关注");
                        if (DyUser.isFocus()) {
                            System.toast('已关注，不操作');
                        } else {
                            DyUser.focus();
                            tCommon.sleep(1000 + Math.random() * 1000);
                        }
                    }

                    if (config.op.includes("1")) {
                        Log.log("执行私信");
                        DyUser.privateMsg(this.getMsg(1, nickname).msg);
                    }

                    tCommon.sleep(config.homeWait * 1000);//主页停留
                    tCommon.swipe(0, 0.5);
                    tCommon.sleep(500);
                    if (tCommon.id(V.Comment.getList[0]).isVisibleToUser(true).findOne()) {
                        Log.log('在列表页面了');
                    } else {
                        tCommon.back();//返回
                    }
                }

                tCommon.sleep(1000);
                Log.log("执行滑动");
                task.swipe();
                System.cleanUp();
            } catch (e) {
                Log.log(e);
                if (!tCommon.id(V.Comment.getList[0]).isVisibleToUser(true).findOne()) {
                    Log.log("找不到标签，返回了");
                    tCommon.back();
                    tCommon.sleep(2000);
                } else {
                    Log.log('滑动一下，解决问题');
                    task.swipe();
                }
            }
        }
    },

    swipe() {
        let scrolls = tCommon.id(V.Common.swipeCommentListOp[0]).scrollable(true).find();
        for (let i in scrolls) {
            scrolls[i].scrollForward();
        }
    }
}

//开启线程  自动关闭弹窗
Engines.executeScript("unit/dialogClose.js");

while (true) {
    task.log();
    try {
        let res = task.run();
        if (res) {
            tCommon.sleep(3000);
            FloatDialogs.show('提示', '已完成');
            break;
        }

        tCommon.sleep(3000);
    } catch (e) {
        Log.log(e);
    }
}
