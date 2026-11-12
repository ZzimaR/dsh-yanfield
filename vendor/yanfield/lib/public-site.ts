/** 介绍页单独发到 GitHub Pages 时为 true。本地写作台里保持 false，首页仍能进书架。 */
export const isPublicSite = process.env.NEXT_PUBLIC_PUBLIC_SITE === "1";
