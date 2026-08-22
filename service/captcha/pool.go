package captcha

// CharacterPool is the single source of truth for which characters the captcha
// can draw. assets/regenerate-subset.sh subsets the bundled font from exactly
// this string, so adding a character here without regenerating the font would
// make it render as a blank box (see TestFontCoversPool).
//
// Visually confusable pairs are deliberately kept apart: only one of 日/目,
// 小/少, 买/卖, 土/士, 石/右, 白/百, 天/夫, 人/入 appears, because a user who
// cannot tell a prompt apart from a distractor cannot solve the challenge.
const CharacterPool = "天地山水火木金土日月星云风雨雪电花草树林竹果米茶酒盐糖鱼鸟马牛羊猫狗虎龙蛇象鹿兔" +
	"人手耳口心头足门窗床桌椅灯书笔纸刀伞钟表车船桥路城村田井石沙海河湖岛泉谷峰洞港" +
	"红黄蓝绿紫黑白灰粉橙" +
	"大小多空高低长短新旧冷热快慢明暗轻重软硬" +
	"走跑飞跳唱笑哭看听说读写吃喝睡洗买找开关"

var poolRunes = []rune(CharacterPool)
