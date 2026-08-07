export default {
  ignore: ["dist", "coverage"],
  aliases: {
    "@": "./src",
  },
  risk: {
    thresholds: {
      medium: 40,
    },
  },
};
