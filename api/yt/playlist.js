module.exports = async function ytPlaylist(req, res) {
  const { handlePlaylist } = await import("../../server/youtube/youtubeInfo.mjs");
  return handlePlaylist(req, res);
};
