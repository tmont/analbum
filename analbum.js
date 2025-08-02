(function(window, document) {
	const parseDurationMs = (duration) => {
		if (typeof(duration) === 'number') {
			return duration;
		}
		if (!duration) {
			return null;
		}

		const [ minutes, seconds ] = duration.split(':').map(x => parseInt(x));
		return (minutes * 60 * 1000) + (seconds * 1000);
	};

	const leftPadZero = x => x < 10 ? `0${x}` : x;

	const prettyDurationFromMs = (ms) => {
		const oneMinute = 60 * 1000;
		const minutes = Math.floor(ms / oneMinute);

		// floor is needed instead of round or you might get a xx:60 timestamp
		const seconds = Math.floor((ms - (minutes * oneMinute)) / 1000);
		if (isNaN(minutes)) {
			return String.fromCharCode(0x2026);
		}
		return leftPadZero(minutes) + ':' + leftPadZero(seconds);
	};

	const prettyDurationFromS = (s) => {
		return prettyDurationFromMs(s * 1000);
	};

	const prettyFilesizeFromBytes = (b) => {
		const kb = 1024;
		const mb = kb * 1024;
		if (b < kb * 10) {
			return (b / kb).toFixed(2) + 'KB';
		}

		if (b < mb) {
			return Math.round(b / kb) + 'KB';
		}

		if (b < mb * 10) {
			return (b / mb).toFixed(2) + 'MB';
		}

		return Math.round(b / mb) + 'MB';
	};

	let albumId = 0;
	let trackId = 0;

	class AudioSource {
		constructor(uri, options = {}) {
			this.uri = uri;
			this.mimetype = options.mimetype || null;
			this.size = options.size || null;
			this.priority = options.priority || null;
			this.name = options.name || null;
		}
	}

	class Score {
		constructor(uri, options = {}) {
			this.uri = uri;
			this.size = options.size || null;
			this.thumbnail = options.thumbnail || null;
		}
	}

	class DownloadLink {
		constructor(uri, options = {}) {
			this.uri = uri;
			this.size = options.size || null;
		}
	}

	class Contributor {
		constructor(name, credits) {
			this.name = name;
			this.credits = credits || [];
		}
	}

	class Lyrics {
		constructor(lrcFile) {
			this.lrcFile = lrcFile;
			this.lyricLines = null;
			this.lyricTimes = null;
			this.req = null;
		}

		async load() {
			if (this.lyricLines) {
				return {
					lines: this.lyricLines,
					times: this.lyricTimes,
				};
			}

			this.lyricLines = [];
			this.lyricTimes = [];

			try {
				this.req = fetch(this.lrcFile).then(res => res.text());
				const text = await this.req;
				const lines = text.split('\n');
				lines.forEach((line) => {
					const matches = /^\[(\d\d:\d\d)\.\d\d](.*)$/.exec(line);
					if (!matches) {
						return;
					}

					this.lyricLines.push(matches[2] || '');
					this.lyricTimes.push(matches[1]);
				});
			} catch (e) {
				this.lyricLines = [];
				this.lyricTimes = [];
				console.error(`failed to load lyrics from ${this.lrcFile}: ${e.message}`);
			}

			return {
				lines: this.lyricLines,
				times: this.lyricTimes,
			};
		}

		getTimeForIndex(index) {
			return this.lyricTimes[index] || null;
		}

		getLyricsAt(timestamp) {
			if (!this.lyricTimes) {
				return;
			}

			let low = 0;
			let high = this.lyricTimes.length - 1;
			let mid = null;
			let prev = null;
			while (low <= high) {
				mid = low + Math.floor(((high - low) / 2));
				if (this.lyricTimes[mid] > timestamp) {
					high = mid - 1;
				} else if (this.lyricTimes[mid] < timestamp) {
					low = mid + 1;
					prev = mid;
				} else {
					// exact match
					return {
						line: this.lyricLines[mid],
						index: mid,
					};
				}
			}

			if (prev === null) {
				return null;
			}

			return {
				line: this.lyricLines[prev],
				index: prev,
			};
		}

		async getLyricsAtDeferred(timestamp) {
			if (!this.req) {
				return;
			}

			await this.req;

			return this.getLyricsAt(timestamp);
		}
	}

	class Track {
		constructor(name, options = {}) {
			this.id = ++trackId;
			this.name = name;
			this.duration = parseDurationMs(options.duration);
			this.sources = options.sources || [];
			this.lyrics = options.lyrics || null;
			this.trackNum = options.trackNum || null;
			this.date = options.date || null;
			this.score = options.score || null;
			this.writers = options.writers || [];
			this.contributors = options.contributors || [];
			this.recommended = !!options.recommended;
			this.markers = options.markers || [];
			this.iconUrl = options.iconUrl || null;
		}

		getUrl(album, time) {
			const url = new URL(window.location.href);
			url.searchParams.set('album', album.name);
			url.searchParams.set('track', this.name);

			if (time) {
				url.searchParams.set('time', time);
			} else {
				url.searchParams.delete('time');
			}

			return url.href;
		}
	}

	class Album {
		constructor(name, tracks, options = {}) {
			this.id = ++albumId;
			this.name = name;
			this.tracks = tracks.sort((a, b) => a.trackNum < b.trackNum ? -1 : 1);
			this.artist = options.artist || null;
			this.date = options.date || null;
			this.description = options.description || null;
			this.coverArt = options.coverArt || null;
			this.downloadLink = options.downloadLink || null;
		}

		get duration() {
			return this.tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
		}
	}

	const albumItemTemplate = `
<div class="analbum-album-item">
	<div class="analbum-album-item-details">
		<div class="analbum-album-info-art">
			<div class="analbum-album-art-default">
				<span class="analbum-icon-music"></span>
			</div>
			<a href="#" target="_blank" class="analbum-album-art-custom">
				<img alt="custom album art" />
			</a>
		</div>
		<div class="analbum-album-item-metadata-container">
			<div>
				<div>
					<span class="analbum-album-title"></span>
					<i class="analbum-icon-info analbum-album-info-toggle" title="album info (I)"></i>
				</div>
				<div class="analbum-album-date"></div>
			</div>
			<div class="analbum-album-metadata">
				<div class="analbum-album-num-tracks"></div>
				<div class="analbum-album-total-duration"></div>
			</div>
		</div>
	</div>
	<div class="analbum-track-list-container">
		<div class="analbum-divider"></div>
		<div class="analbum-track-list"></div>
		<div class="analbum-album-download-container">
			<div class="analbum-divider"></div>
			<a href="">
				<i class="analbum-icon-download2"></i>&nbsp;
				Download album
				<span class="analbum-size"></span>			
			</a>
		</div>
	</div>
</div>	
`;

	const trackItemTemplate = `
<a class="analbum-track-item" href="#">
	<span class="analbum-track-number"></span>
	<span class="analbum-track-title-container">
		<i class="analbum-icon-star-full analbum-recommended-badge" title="Recommended listening"></i>
		<span class="analbum-track-title"></span>
	</span>
	<span class="analbum-track-icon"></span>
	<span class="analbum-track-duration"></span>
</a>	
`;

	const markerTemplate = `
<div class="analbum-track-marker">
	<div class="analbum-track-marker-line"></div>
	<a class="analbum-track-marker-label" href="#">
		<div class="analbum-track-marker-time"></div>
		<div class="analbum-divider"></div>
		<div class="analbum-track-marker-content"></div>
	</a>
</div>`;

	const lyricLineTemplate = `
<div class="analbum-lyric-line">
	<span class="analbum-lyric-line-time analbum-sm-hide"></span>
	<a href="#"></a>
</div>`;

	const template = `
<div class="analbum-container">
	<div class="analbum-row">
		<div class="analbum-album-list"></div>
	</div>
	<div class="analbum-row">
		<div class="analbum-now-playing">
			<div class="analbum-now-playing-info">
				<div class="analbum-track-info">
					<div class="analbum-album-info-art">
						<div class="analbum-album-art-default">
							<span class="analbum-icon-music"></span>
						</div>
						<a href="#" target="_blank" class="analbum-album-art-custom">
							<img alt="custom album art" />
						</a>
					</div>
					<div class="analbum-track-info-detail">
						<div class="analbum-track-title"></div>
						<div class="analbum-muted">
							<span class="analbum-album-artist"></span> &mdash; <span class="analbum-album-title"></span>
							<div class="analbum-album-date"></div>
							<div class="analbum-track-credits-container">
								<div class="analbum-track-writers-container">
									<span class="analbum-track-writers"></span>
									<span style="font-size: 75%">▾</span>
								</div>
								<div class="analbum-track-credits-popup">
									<div class="analbum-track-writers-container">
										<span class="analbum-track-writers"></span>
									</div>
									<div class="analbum-divider" style="margin: 5px 0; width: 100%"></div>
									<div class="analbum-track-contributors"></div>
								</div>
							</div>
						</div>
					</div>
					<div class="analbum-download-detail">
						<a class="analbum-download-audio" href="" target="_blank">
							<i class="analbum-icon-download2"></i>&nbsp;
							Download audio (<span></span>)
						</a>
						<a class="analbum-download-score" href="" target="_blank">
							<i class="analbum-icon-download2"></i>&nbsp;
							Download score (<span></span>)
						</a>
					</div>
				</div>
				
				<div class="analbum-progress-container">
					<div class="analbum-progress-time"></div>
					<div class="analbum-progress-bar-container">
						<div class="analbum-progress-bar">
							<div class="analbum-seeking-container">
								<div class="analbum-tooltip-outer bottom"></div>
								<div class="analbum-tooltip-inner bottom"></div>
								<span></span>
							</div>
							<div class="analbum-progress-progress"></div>
						</div>
					</div>
					<div class="analbum-progress-duration"></div>
				</div>
				<div class="analbum-controls">
					<div class="analbum-controls-left">
						<div class="analbum-control analbum-toggle-markers" title="Toggle markers (M)">
							<span>show</span> markers
						</div>
					</div>
					<div class="analbum-controls-center">
						<div class="analbum-control analbum-prev" title="Previous track (Ctrl+Left)"><i class="analbum-icon-previous2"></i></div>
						<div class="analbum-control analbum-play-pause" title="Play (Space, K)"><i class="analbum-icon-play3"></i></div>
						<div class="analbum-control analbum-next" title="Next track (Ctrl+Right)"><i class="analbum-icon-next2"></i></div>
					</div>
					<div class="analbum-controls-right">
						<div class="analbum-control analbum-toggle-lyrics" title="Toggle lyrics (L)">
							<span>hide</span> lyrics
						</div>
						<label class="analbum-control analbum-lyrics-auto-scroll analbum-sm-hide" title="Keep current lyric line in viewport">
							<input type="checkbox" />
							auto-scroll
						</label>
					</div>
				</div>
			</div>
			
			<div class="analbum-lyrics-container">
				<div class="analbum-divider"></div>
				<div class="analbum-lyrics-lines"></div>
			</div>
			<div class="analbum-divider analbum-mobile"></div>
		</div>
	</div>
	<div class="analbum-info-global">
		<div class="analbum-info-global-toggle">
			<i class="analbum-icon-info"></i>
			Info
			<span class="analbum-close" title="close info box">&times;</span>
		</div>
		<div class="analbum-info-global-content"></div>
	</div>
	<div class="analbum-info-album-window">
		<div class="top analbum-tooltip-outer"></div>
		<div class="top analbum-tooltip-inner"></div>
		<div class="analbum-info-album-window-content"></div>
	</div>
	<audio></audio>
</div>
`;

	const parser = new DOMParser();
	const parseTemplate = (html) => {
		return parser.parseFromString(html, 'text/html').body.firstChild;
	};
	const text = (text) => {
		return document.createTextNode(text.toString());
	};
	const s = x => x === 1 ? '' : 's';

	class UI {
		constructor(options = {}) {
			this.description = options.description || [];
			this.albums = (options.albums || []).sort((a, b) => (b.date || '').toString().localeCompare((a.date || '').toString()));
			this.container = null;
			this.currentAlbum = null;
			this.currentTrack = null;
			this.draggingProgressBar = false;
			this.currentTime = null;
			this.currentDuration = null;
			this.hidingLyrics = false;
			this.showingContributors = false;
			this.showingGlobalInfo = false;
			this.showingAlbumInfo = false;
			this.showingMarkers = false;
			this.autoScrollLyrics = true;
		}

		mount(element) {
			if (this.container) {
				return;
			}

			this.container = parseTemplate(template);
			element.appendChild(this.container);

			this.albums.forEach((album) => {
				const albumItem = parseTemplate(albumItemTemplate);
				albumItem.setAttribute('data-album-id', album.id);
				albumItem.querySelector('.analbum-album-title').appendChild(text(album.name));
				albumItem.querySelector('.analbum-album-num-tracks').appendChild(text(album.tracks.length + ' track' + s(album.tracks.length)));
				albumItem.querySelector('.analbum-album-total-duration').appendChild(text(prettyDurationFromMs(album.duration)));

				if (album.date) {
					albumItem.querySelector('.analbum-album-date').appendChild(document.createTextNode(album.date));
				}

				const infoToggle = albumItem.querySelector('.analbum-album-info-toggle');
				if (!album.description) {
					infoToggle.style.display = 'none';
				} else {
					infoToggle.addEventListener('click', (e) => {
						e.stopPropagation();
						this.toggleAlbumInfo(album);
					});
				}

				albumItem.addEventListener('click', () => {
					this.selectAlbum(album);
				});

				this.setAlbumArt(album, albumItem.querySelector('.analbum-album-info-art'));

				const trackList = albumItem.querySelector('.analbum-track-list');
				if (!trackList) {
					throw new Error('track list not found in album item');
				}

				const downloadContainer = albumItem.querySelector('.analbum-album-download-container');
				if (!downloadContainer) {
					throw new Error('download link not found in album item');
				}
				if (album.downloadLink) {
					downloadContainer.style.display = 'block';
					const downloadLink = downloadContainer.querySelector('a');
					downloadLink.setAttribute('href', album.downloadLink.uri);
					const size = downloadLink.querySelector('span');
					if (album.downloadLink.size) {
						size.style.display = 'inline';
						size.innerText = `(${prettyFilesizeFromBytes(album.downloadLink.size)})`;
					} else {
						size.style.display = 'none';
					}
				}

				album.tracks.forEach((track, i) => {
					const trackItem = parseTemplate(trackItemTemplate);
					if (track.recommended) {
						trackItem.classList.add('analbum-recommended');
					}
					trackItem.setAttribute('data-track-id', track.id);
					trackItem.querySelector('.analbum-track-title').appendChild(text(track.name));
					trackItem.querySelector('.analbum-track-number').appendChild(text(leftPadZero(track.trackNum || (i + 1))));
					trackItem.querySelector('.analbum-track-duration').appendChild(text(prettyDurationFromMs(track.duration)));
					trackItem.addEventListener('click', (e) => {
						e.preventDefault();

						this.pause();
						this.selectTrack(track);
						this.playOrPause();
					});

					trackItem.href = track.getUrl(album);

					if (track.iconUrl) {
						const container = trackItem.querySelector('.analbum-track-icon');
						container.style.backgroundImage = `url(${track.iconUrl})`;
						container.style.backgroundRepeat = 'none';
					}

					trackList.appendChild(trackItem);
				});

				this.find('.analbum-album-list').appendChild(albumItem);
			});

			// wire up events
			this.find('.analbum-play-pause').addEventListener('click', () => {
				if (this.isPlaying()) {
					this.pause();
				} else {
					this.play();
				}
			});

			this.find('.analbum-next').addEventListener('click', () => {
				this.goToNextTrack();
			});

			this.find('.analbum-prev').addEventListener('click', () => {
				this.goToPrevTrack();
			});

			this.find('.analbum-toggle-lyrics').addEventListener('click', () => {
				this.toggleLyrics();
			});
			this.find('.analbum-toggle-markers').addEventListener('click', () => {
				this.toggleMarkers();
			});

			this.find('.analbum-track-writers-container').addEventListener('click', () => {
				this.toggleContributors(true);
			});

			const globalInfo = this.find('.analbum-info-global');
			if (!this.description.length) {
				globalInfo.style.display = 'none';
			} else {
				const html = this.description.map(markup => `<p>${markup}</p>`).join('');
				this.find('.analbum-info-global-content').innerHTML = `<div class="analbum-divider" style="margin:10px auto;"></div>${html}`;
			}

			this.find('.analbum-info-global-toggle').addEventListener('click', () => {
				this.toggleGlobalInfo();
			});

			const progressBar = this.find('.analbum-progress-bar');
			progressBar.addEventListener('click', (e) => {
				const rect = progressBar.getBoundingClientRect();
				const relativeX = e.clientX - rect.left;
				const width = rect.width;
				const pct = (relativeX / width) * 100;
				this.seekToPercent(pct);
			});

			let seekDragPct = null;

			const calculateSeekDragPct = (e) => {
				const rect = progressBar.getBoundingClientRect();
				const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
				const relativeX = clientX - rect.left;
				const width = rect.width;
				return (relativeX / width) * 100;
			};

			const updateProgressPct = (e) => {
				seekDragPct = calculateSeekDragPct(e);
				this.setProgressWidth(seekDragPct);
				this.updateSeekingWindow(seekDragPct);
			};

			const progressMouseDown = (e) => {
				this.draggingProgressBar = true;
				this.container.classList.add('analbum-seeking');
				updateProgressPct(e);
			};

			progressBar.addEventListener('mousedown', progressMouseDown);
			progressBar.addEventListener('touchstart', progressMouseDown);
			progressBar.addEventListener('mousemove', (e) => {
				if (this.draggingProgressBar) {
					return;
				}

				this.container.classList.add('analbum-peeking');
				const seekDragPct = calculateSeekDragPct(e);
				this.updateSeekingWindow(seekDragPct);
			});
			progressBar.addEventListener('mouseout', () => {
				this.container.classList.remove('analbum-peeking');
			});

			this.handleMouseUp = () => {
				this.container.classList.remove('analbum-seeking');
				this.draggingProgressBar = false;
				if (seekDragPct !== null) {
					this.seekToPercent(seekDragPct);
				}

				seekDragPct = null;
			};
			this.handleMouseMove = (e) => {
				if (!this.draggingProgressBar) {
					return;
				}

				updateProgressPct(e);
			};

			progressBar.addEventListener('mouseup', this.handleMouseUp);
			progressBar.addEventListener('touchend', this.handleMouseUp);
			progressBar.addEventListener('mousemove', this.handleMouseMove);
			progressBar.addEventListener('touchmove', this.handleMouseMove);
			document.addEventListener('mouseup', this.handleMouseUp);
			document.addEventListener('touchend', this.handleMouseUp);
			document.addEventListener('mousemove', this.handleMouseMove);
			document.addEventListener('touchmove', this.handleMouseMove);

			this.handleDocumentClick = (e) => {
				let ancestor = e.target;
				if (this.showingContributors) {
					let hideContributors = true;
					while (ancestor && ancestor.classList) {
						if (ancestor.classList.contains('analbum-track-credits-container')) {
							hideContributors = false;
							break;
						}

						ancestor = ancestor.parentNode;
					}
					if (hideContributors) {
						this.toggleContributors(false);
					}
				}

				if (this.showingGlobalInfo) {
					let hideGlobalInfo = true;
					while (ancestor && ancestor.classList) {
						if (ancestor.classList.contains('analbum-info-global')) {
							hideGlobalInfo = false;
							break;
						}

						ancestor = ancestor.parentNode;
					}
					if (hideGlobalInfo) {
						this.toggleGlobalInfo(false);
					}
				}

				if (this.showingAlbumInfo) {
					let hideAlbumInfo = true;
					while (ancestor && ancestor.classList) {
						if (ancestor.classList.contains('analbum-info-album-window')) {
							hideAlbumInfo = false;
							break;
						}

						ancestor = ancestor.parentNode;
					}
					if (hideAlbumInfo) {
						this.toggleAlbumInfo(null);
					}
				}
			};

			document.addEventListener('click', this.handleDocumentClick);

			try {
				navigator.mediaSession.setActionHandler('play', () => {
					this.play();
				});
				navigator.mediaSession.setActionHandler('pause', () => {
					this.pause();
				});
				navigator.mediaSession.setActionHandler('nexttrack', () => {
					this.goToNextTrack();
				});
				navigator.mediaSession.setActionHandler('previoustrack', () => {
					this.goToPrevTrack();
				});
			} catch (e) {
				console.error('Could not bind to mediaSession', e);
			}

			this.handleDocumentKeyDown = (e) => {
				const modified = e.altKey || e.ctrlKey || e.metaKey;
				switch (e.code) {
					case 'Space':
					case 'KeyK':
						if (modified) {
							break;
						}

						e.preventDefault();
						this.playOrPause();
						break;
					case 'KeyM':
						if (modified) {
							break;
						}

						e.preventDefault();
						this.toggleMarkers();
						break;
					case 'KeyL':
						if (modified) {
							break;
						}

						e.preventDefault();
						this.toggleLyrics();
						break;
					case 'KeyI':
						if (modified) {
							break;
						}

						e.preventDefault();
						this.toggleAlbumInfo(this.currentAlbum);
						break;
					case 'ArrowLeft':
					case 'ArrowRight':
						if (e.altKey) {
							break;
						}

						const isArrowLeft = e.code === 'ArrowLeft';

						e.preventDefault();
						if (e.ctrlKey) {
							if (e.shiftKey) {
								isArrowLeft ? this.goToPrevAlbum() : this.goToNextAlbum();
							} else {
								isArrowLeft ? this.goToPrevTrack() : this.goToNextTrack();
							}
						} else {
							let seekAmount = 10;
							if (e.shiftKey) {
								seekAmount = 3;
							}
							this.seekToTimeRelative(isArrowLeft ? -seekAmount : seekAmount);
						}
						break;
					case 'Escape':
						this.toggleContributors(false);
						if (this.showingMarkers) {
							this.toggleMarkers();
						}
						this.toggleAlbumInfo();
						break;
				}
			};

			document.addEventListener('keydown', this.handleDocumentKeyDown);

			const autoScrollInput = this.find('.analbum-lyrics-auto-scroll input[type="checkbox"]');
			this.autoScrollLyrics = autoScrollInput.checked;
			autoScrollInput.addEventListener('change', (e) => {
				this.autoScrollLyrics = e.target.checked;
			});

			this.wireAudioEvents();
			this.initializeAlbumAndTrack();
		}

		initializeAlbumAndTrack() {
			const qs = new URLSearchParams(window.location.search);

			let album;
			let track;

			if (qs.has('album')) {
				const albumName = qs.get('album').toLowerCase();
				album = this.albums.find(album => album.name.toLowerCase() === albumName);
				if (album) {
					this.selectAlbum(album);
					if (qs.has('track')) {
						const trackName = qs.get('track').toLowerCase().replace(/’/g, '\'');
						track = album.tracks.find(track => track.name.toLowerCase().replace(/’/g, '\'') === trackName);
						if (track) {
							this.selectTrack(track);
							return;
						}
					}
				}
			}

			// default to first track on first album
			this.setNextTrack(1);
		}

		unmount() {
			const container = this.container;
			if (container) {
				container.parentElement.removeChild(container);
			}

			this.container = null;
			document.removeEventListener('mouseup', this.handleMouseUp);
			document.removeEventListener('mousemove', this.handleMouseMove);
			document.removeEventListener('touchend', this.handleMouseUp);
			document.removeEventListener('touchmove', this.handleMouseMove);
			document.removeEventListener('click', this.handleDocumentClick);
			document.removeEventListener('keydown', this.handleDocumentKeyDown);
		}

		find(selector) {
			const element = this.container.querySelector(selector);
			if (!element) {
				throw new Error(`selector "${selector}" not found in container`);
			}
			return element;
		}

		getAudioElement() {
			if (!this.container) {
				throw new Error('not mounted');
			}

			return this.container.querySelector('audio');
		}

		updateProgress() {
			const audio = this.getAudioElement();
			const newTime = prettyDurationFromS(audio.currentTime);

			if (newTime !== this.currentTime) {
				this.find('.analbum-progress-time').innerHTML = prettyDurationFromS(audio.currentTime);
			}

			if (!isNaN(audio.duration)) {
				const newDuration = prettyDurationFromS(audio.duration);
				if (newDuration !== this.currentDuration) {
					this.find('.analbum-progress-duration').innerHTML = prettyDurationFromS(audio.duration);
				}
				this.currentDuration = newDuration;
			} else {
				this.currentDuration = null;
			}

			this.currentTime = newTime;

			if (this.currentTrack.lyrics) {
				const timestamp = prettyDurationFromS(audio.currentTime);
				this.currentTrack.lyrics.getLyricsAtDeferred(timestamp)
					.then((lyricData) => {
						if (lyricData) {
							try {
								const lyricsContainer = this.find('.analbum-lyrics-lines');
								const line = this.find(`.analbum-lyric-line[data-lyric-index="${lyricData.index}"]`);

								this.container.querySelectorAll('.analbum-lyric-current').forEach((line) => {
									line.classList.remove('analbum-lyric-current');
								});
								line.classList.add('analbum-lyric-current');

								if (this.autoScrollLyrics) {
									const lineTop = line.offsetTop;
									const scrollableHeight = lyricsContainer.offsetHeight;
									const fudge = 50;
									const diff = lineTop - lyricsContainer.scrollTop;

									if (diff < fudge || diff > scrollableHeight - fudge) {
										lyricsContainer.scrollTop = Math.max(0, lineTop - scrollableHeight + fudge);
									}
								}
							} catch (e) {
								// line for timestamp not found
							}
						}
					});
			}

			if (!this.draggingProgressBar) {
				this.setProgressWidth((audio.currentTime / audio.duration) * 100);
			}
		}

		updateSeekingWindow(pct) {
			pct = Math.max(Math.min(100, pct), 0);
			const seeking = this.find('.analbum-seeking-container');
			seeking.style.left = pct + '%';
			seeking.style.transform = `translateX(-${seeking.offsetWidth / 2}px)`;

			const ms = this.getMsDurationFromPercent(pct);
			seeking.querySelector('span').innerHTML = prettyDurationFromMs(ms);
		}

		setProgressWidth(pct) {
			pct = Math.max(Math.min(100, pct), 0);
			this.find('.analbum-progress-progress').style.width = pct + '%';
		}

		wireAudioEvents() {
			const audio = this.getAudioElement();
			audio.addEventListener('timeupdate', () => {
				this.updateProgress();
			});
			audio.addEventListener('ended', () => {
				this.setNextTrack(1);
				this.play();
			});
			audio.addEventListener('loadedmetadata', () => {
				this.updateProgress();
			});
			audio.addEventListener('play', () => {
				this.updateMenuIcons();
			});
			audio.addEventListener('pause', () => {
				this.updateMenuIcons();
			});
		}

		selectAlbum(album) {
			if (album === this.currentAlbum) {
				return;
			}

			this.currentAlbum = album;

			const albumList = this.find(`.analbum-album-list`);
			const albumItem = albumList.querySelector(`[data-album-id="${album.id}"]`);
			if (!albumItem) {
				throw new Error('album not found in list');
			}

			albumList.querySelectorAll('.analbum-album-item').forEach((node) => {
				node.classList.remove('active');
			});
			albumItem.classList.add('active');
		}

		selectTrack(track) {
			this.currentTrack = track;
			const allItems = this.container.querySelectorAll(`.analbum-track-item`);
			const trackItem = this.find(`.analbum-track-item[data-track-id="${track.id}"]`);
			if (!trackItem) {
				throw new Error(`track with ID "${track.id}" not found in list`);
			}

			allItems.forEach((node) => {
				node.classList.remove('active');
			});

			trackItem.classList.add('active');

			this.updateTrackInfo();
			this.loadAudio();
		}

		getPlayingAlbum() {
			return this.albums.find(album => album.tracks.indexOf(this.currentTrack) !== -1) || null;
		}

		setNextTrack(direction = 1) {
			if (!this.albums.length) {
				throw new Error('no albums');
			}

			if (!this.currentAlbum) {
				this.selectAlbum(this.albums[0]);
			}
			if (!this.currentAlbum.tracks.length) {
				throw new Error('album has no tracks');
			}

			const playingAlbum = this.getPlayingAlbum() || this.currentAlbum;

			const currentTrackIndex = this.currentTrack ?
				playingAlbum.tracks.findIndex(track => track === this.currentTrack) :
				-1;

			if (playingAlbum.tracks[currentTrackIndex + direction]) {
				this.selectTrack(playingAlbum.tracks[currentTrackIndex + direction]);
			} else {
				// go to next album

				// if you're looking at a different album than the one that was playing, just start
				// playing the current one. otherwise, go to the next one.
				if (playingAlbum === this.currentAlbum) {
					const currentAlbumIndex = this.albums.findIndex(album => album === playingAlbum);
					if (this.albums[currentAlbumIndex + direction]) {
						this.selectAlbum(this.albums[currentAlbumIndex + direction]);
					} else {
						this.selectAlbum(this.albums[direction > 0 ? 0 : this.albums.length - 1]);
					}
				}

				if (!this.currentAlbum.tracks.length) {
					throw new Error(`album "${this.currentAlbum.name}" contains no tracks`);
				}

				this.selectTrack(this.currentAlbum.tracks[direction > 0 ? 0 : this.currentAlbum.tracks.length - 1]);
			}

			if (!this.currentTrack.sources.length) {
				throw new Error(`track "${this.currentTrack.name}" contains no sources`);
			}
		}

		loadAudio() {
			const audio = this.getAudioElement();
			audio.innerHTML = '';
			this.currentTrack.sources.forEach((source) => {
				const el = document.createElement('source');
				if (source.mimetype) {
					el.setAttribute('type', source.mimetype);
				}
				el.setAttribute('src', source.uri);
				audio.appendChild(el);
			});

			audio.load();

			const currentUrl = new URL(window.location.href);
			const seekTo = currentUrl.searchParams.get('time');
			if (seekTo && /^(\d+:\d\d|\d+)$/.test(seekTo)) {
				const seekToMs = /^\d+$/.test(seekTo) ?
					parseInt(seekTo, 10) * 1000 :
					seekTo.split(':')
						.map((x, i) => parseInt(x, 10) * (i === 0 ? 60 : 1))
						.reduce((ms, sec) => ms + (sec * 1000), 0);

				this.seekToTimeMs(seekToMs);
				this.updateProgress();
			}
		}

		updateTrackInfo() {
			if (!this.container) {
				return;
			}
			if (!this.currentTrack) {
				return;
			}

			const playingAlbum = this.getPlayingAlbum();
			const track = this.currentTrack;

			const lyricsContainer = this.find('.analbum-lyrics-container');
			const lyricsLines = this.find('.analbum-lyrics-lines');
			lyricsLines.innerHTML = '';

			if (track.lyrics) {
				this.container.classList.remove('analbum-no-lyrics');
				lyricsContainer.style.display = this.hidingLyrics ? 'none' : 'block';

				const lineNode = parseTemplate(lyricLineTemplate);
				track.lyrics.load()
					.then(({ lines, times }) => {
						lines.forEach((line, i) => {
							const cloned = lineNode.cloneNode(true);
							cloned.setAttribute('data-lyric-index', i);
							const textContainer = cloned.querySelector('a');
							if (!line) {
								textContainer.appendChild(document.createElement('br'));
							} else {
								textContainer.appendChild(document.createTextNode(line));
							}

							const time = times[i];
							if (time) {
								const timestamp = parseDurationMs(time);
								textContainer.setAttribute('title', 'seek to ' + time);
								textContainer.addEventListener('click', (e) => {
									e.preventDefault();
									this.seekToTimeMs(timestamp);
								});

								cloned.querySelector('.analbum-lyric-line-time').appendChild(document.createTextNode(time));
							}

							if (this.currentAlbum) {
								textContainer.href = track.getUrl(this.currentAlbum, time);
							}

							lyricsLines.appendChild(cloned);
						});
					})
					.catch((e) => {
						console.error(`failed to load lyrics: ${e.message}`);
					});
			} else {
				lyricsContainer.style.display = 'none';
				this.container.classList.add('analbum-no-lyrics');
			}

			const setText = (selector, text) => {
				this.find(selector).innerHTML = '';
				if (text) {
					this.find(selector).appendChild(document.createTextNode(text));
				}
			};

			setText('.analbum-now-playing .analbum-track-title', track.name);
			setText('.analbum-now-playing .analbum-album-title', playingAlbum.name);
			setText('.analbum-now-playing .analbum-album-artist', playingAlbum.artist);

			let trackDate = track.date?.toString() || '';
			if (/\d{4}-\d\d-\d\d/.test(trackDate)) {
				const f = new Intl.DateTimeFormat([], {
					dateStyle: 'long',
					timeZone: 'UTC',
				});

				trackDate = f.format(new Date(trackDate));
			}

			setText('.analbum-now-playing .analbum-album-date', trackDate);

			const coverArt = this.find('.analbum-now-playing .analbum-album-info-art')
			this.setAlbumArt(playingAlbum, coverArt);

			const downloadScore = this.find('.analbum-now-playing .analbum-download-score');
			if (track.score) {
				downloadScore.style.display = 'block';
				downloadScore.querySelector('span').innerText = prettyFilesizeFromBytes(track.score.size);
				downloadScore.setAttribute('href', track.score.uri);
			} else {
				downloadScore.style.display = 'none';
			}

			const downloadAudio = this.find('.analbum-now-playing .analbum-download-audio');

			// prefer mp3 sources for downloading
			const source = track.sources.find(source => /mpeg/.test(source.mimetype)) || track.sources[0];
			downloadAudio.querySelector('span').innerText = prettyFilesizeFromBytes(source.size);
			downloadAudio.setAttribute('href', source.uri);

			const containers = this.container.querySelectorAll('.analbum-now-playing .analbum-track-writers-container');
			const writersEl = this.container.querySelectorAll('.analbum-now-playing .analbum-track-writers');
			if (track.writers.length) {
				containers.forEach(container => container.style.display = 'block');
				let writers = 'written by ';
				if (track.writers.length === 1) {
					writers += track.writers[0];
				} else {
					writers += track.writers.slice(0, track.writers.length - 1).join(', ') +
						' and ' + track.writers[track.writers.length - 1];
				}
				writersEl.forEach((writerEl) => {
					writerEl.innerHTML = '';
					writerEl.appendChild(document.createTextNode(writers));
				});
			} else {
				writersEl.forEach(writerEl => writerEl.innerHTML = '');
				containers.forEach(container => container.style.display = 'none');
			}

			const contributorsEl = this.find('.analbum-now-playing .analbum-track-contributors');
			contributorsEl.innerHTML = '';
			track.contributors.forEach((contributor) => {
				const el = document.createElement('div');
				const b = document.createElement('strong');
				b.appendChild(document.createTextNode(contributor.name));
				el.appendChild(b);
				el.appendChild(document.createTextNode(': ' + contributor.credits.join(', ')));
				contributorsEl.appendChild(el);
			});

			const markerNode = parseTemplate(markerTemplate);
			const progressBar = this.find('.analbum-progress-bar-container');
			progressBar.querySelectorAll('.analbum-track-marker').forEach((marker) => {
				marker.parentNode.removeChild(marker);
			});

			if (track.markers.length) {
				this.find('.analbum-toggle-markers').style.display = 'block';
				const prevNodes = [];
				const barWidth = this.find('.analbum-progress-bar').getBoundingClientRect().width;
				track.markers.forEach((marker, i) => {
					const time = parseDurationMs(marker.time);
					const offset = time / track.duration;
					const node = markerNode.cloneNode(true);
					const prettyTime = prettyDurationFromMs(time);

					node.querySelector('.analbum-track-marker-content').innerText = marker.label;
					node.querySelector('.analbum-track-marker-time').innerText = prettyTime;
					node.style.left = (offset * 100) + '%';
					const label = node.querySelector('.analbum-track-marker-label');
					label.href = track.getUrl(playingAlbum, prettyTime);
					label.addEventListener('click', (e) => {
						e.preventDefault();
						this.seekToTimeMs(time);
					});
					label.setAttribute('title', `seek to ${prettyTime}`);

					progressBar.appendChild(node);

					const expectedWidth = (marker.label.length * 5.25) + 15;

					const invalidLevels = {};
					for (let j = 0; j < prevNodes.length; j++) {
						const data = prevNodes[j];
						const prevOffset = data.offset;
						const level = data.level;
						const distance = (offset * barWidth) - (prevOffset * barWidth);
						if (distance < expectedWidth + 10) {
							invalidLevels[level] = 1;
						}
					}

					const levels = {};
					for (let j = 0; j < 10; j++) {
						levels[j] = invalidLevels[j] || 0;
					}

					const level = Object.keys(levels)
						.map(x => Number(x))
						.sort()
						.map(x => levels[x])
						.findIndex(x => x === 0);

					const height = 35 + (level * 30);

					const line = node.querySelector('.analbum-track-marker-line');
					line.style.height = height + 'px';

					prevNodes.push({
						offset,
						level,
					});
				});
			} else {
				this.find('.analbum-toggle-markers').style.display = 'none';
			}

			try {
				const metadata = new MediaMetadata({
					title: track.name,
					artist: playingAlbum.artist,
					album: playingAlbum.name,
				});

				if (playingAlbum.coverArt) {
					metadata.artwork = [{
						src: playingAlbum.coverArt,
					}];
				}

				navigator.mediaSession.metadata = metadata;
			} catch {
				console.error('Could not set mediaSession metadata', e);
			}

			this.updateProgress();
		}

		setAlbumArt(album, covertArtContainer) {
			const defaultArt = covertArtContainer.querySelector('.analbum-album-art-default');
			const customArt = covertArtContainer.querySelector('.analbum-album-art-custom');
			if (album.coverArt) {
				defaultArt.style.display = 'none';
				customArt.style.display = 'block';
				customArt.href = album.coverArt;
				customArt.querySelector('img').src = album.coverArt;
			} else {
				defaultArt.style.display = 'flex';
				customArt.style.display = 'none';
			}
		}

		isPlaying() {
			return !this.getAudioElement().paused;
		}

		play() {
			const audio = this.getAudioElement();

			if (!audio.paused) {
				return;
			}

			// no track loaded or current track finished
			if (!this.currentTrack || audio.ended) {
				this.setNextTrack();
			}

			if (this.currentAlbum && this.currentTrack && window.history) {
				window.history.replaceState(null, '', this.currentTrack.getUrl(this.currentAlbum));
			}

			audio.play();
			this.updateMenuIcons();
		}

		pause() {
			this.getAudioElement().pause();
			this.updateMenuIcons();
		}

		playOrPause() {
			if (!this.isPlaying()) {
				this.play();
			} else {
				this.pause();
			}
		}

		seekToTimeMs(timeMs) {
			this.getAudioElement().currentTime = timeMs / 1000;
		}

		seekToTimeRelative(timeS) {
			this.seekToTimeMs(Math.max(0, (this.getAudioElement().currentTime + timeS)) * 1000);
		}

		getMsDurationFromPercent(pct) {
			pct = Math.min(Math.max(0, pct), 100);
			const duration = this.getAudioElement().duration;
			if (isNaN(duration)) {
				return null;
			}
			return duration * (pct / 100) * 1000;
		}

		seekToPercent(pct) {
			const newTime = this.getMsDurationFromPercent(pct);
			if (newTime === null) {
				return;
			}
			this.seekToTimeMs(newTime);
		}

		goToNextTrack() {
			this.pause();
			this.setNextTrack(1);
			this.play();
		}

		goToPrevTrack() {
			this.pause();
			this.setNextTrack(-1);
			this.play();
		}

		goToPrevAlbum() {
			if (this.albums.length <= 1) {
				return;
			}

			this.pause();
			const playingAlbum = this.getPlayingAlbum() || this.currentAlbum;
			let albumIndex = this.albums.indexOf(playingAlbum);
			if (albumIndex === 0) {
				albumIndex = this.albums.length;
			}
			const prevAlbum = this.albums[albumIndex - 1];
			this.selectAlbum(prevAlbum);
			this.selectTrack(prevAlbum.tracks[0]);
			this.play();
		}

		goToNextAlbum() {
			if (this.albums.length <= 1) {
				return;
			}

			this.pause();
			const playingAlbum = this.getPlayingAlbum() || this.currentAlbum;
			let albumIndex = this.albums.indexOf(playingAlbum);
			if (albumIndex === this.albums.length - 1) {
				albumIndex = -1;
			}
			const nextAlbum = this.albums[albumIndex + 1];
			this.selectAlbum(nextAlbum);
			this.selectTrack(nextAlbum.tracks[0]);
			this.play();
		}

		toggleLyrics() {
			const lyricsContainer = this.find('.analbum-lyrics-container');
			this.hidingLyrics = !this.hidingLyrics;
			lyricsContainer.style.display = this.hidingLyrics ? 'none' : 'block';
			this.find('.analbum-toggle-lyrics span').innerText = this.hidingLyrics ? 'show' : 'hide';
		}

		toggleMarkers() {
			this.showingMarkers = !this.showingMarkers;
			this.container.classList.toggle('analbum-showing-markers');
			this.find('.analbum-toggle-markers span').innerText = this.showingMarkers ? 'hide' : 'show';
		}

		toggleContributors(show) {
			if (show && this.showingContributors) {
				return;
			}
			if (!show && !this.showingContributors) {
				return;
			}

			const creditsContainer = this.find('.analbum-track-credits-container');
			this.showingContributors = show;
			const cls = 'analbum-showing-contributors';
			creditsContainer.classList.toggle(cls);
		}

		toggleGlobalInfo(show) {
			show = typeof(show) === 'boolean' ? show : !this.showingGlobalInfo;
			if (show && this.showingGlobalInfo) {
				return;
			}
			if (!show && !this.showingGlobalInfo) {
				return;
			}

			this.showingGlobalInfo = show;
			this.container.classList.toggle('analbum-showing-global-info');
		}

		toggleAlbumInfo(album) {
			const infoWindow = this.find('.analbum-info-album-window');
			const isShowing = this.showingAlbumInfo;
			const currentAlbumId = Number(infoWindow.getAttribute('data-album-id'));

			if (!album || (isShowing && album.id === currentAlbumId)) {
				infoWindow.style.display = 'none';
				this.showingAlbumInfo = false;
				return;
			}

			this.showingAlbumInfo = true;
			infoWindow.style.display = 'block';
			infoWindow.setAttribute('data-album-id', album.id.toString());
			infoWindow.querySelector('.analbum-info-album-window-content').innerHTML = album.description;

			const albumItem = this.find(`.analbum-album-item[data-album-id="${album.id}"]`);
			const toggle = albumItem.querySelector(`.analbum-album-info-toggle`);
			const toggleRect = toggle.getBoundingClientRect();
			const containerRect = this.container.getBoundingClientRect();
			infoWindow.style.left = '10px';

			const orientation = toggleRect.top + 200 >= window.innerHeight ? 'bottom' : 'top';
			const tooltipItems = infoWindow.querySelectorAll('[class*="analbum-tooltip-"]');

			tooltipItems.forEach((item) => {
				item.classList.remove('top', 'bottom');
				item.classList.add(orientation);
			});

			const toggleTop = toggleRect.top - containerRect.top - 2; // -2 for the container border
			if (orientation === 'top') {
				infoWindow.style.top = (toggleTop + toggleRect.height + 12) + 'px';
				infoWindow.style.bottom = 'auto';
			} else {
				infoWindow.style.bottom = (containerRect.height - toggleTop + 6) + 'px';
				infoWindow.style.top = 'auto';
			}

			infoWindow.style.width = (albumItem.getBoundingClientRect().width - 20) + 'px';

			const tooltips = infoWindow.querySelectorAll('[class*="analbum-tooltip"]');
			const tooltipLeft = toggleRect.left - containerRect.left - 7;
			tooltips.forEach((tooltip) => {
				tooltip.style.left = tooltipLeft + 'px';
			});
		}

		updateMenuIcons() {
			const playPause = this.find('.analbum-play-pause');
			playPause.querySelector('.analbum-play-pause i').className = this.isPlaying() ?
				'analbum-icon-pause2' :
				'analbum-icon-play3';

			playPause.setAttribute('title', this.isPlaying() ? 'Pause (Space, K)' : 'Play (Space, K)');
		}

		mute() {
			this.getAudioElement().muted = true;
			this.updateMenuIcons();
		}

		unmute() {
			this.getAudioElement().muted = false;
			this.updateMenuIcons();
		}

		isMuted() {
			return this.getAudioElement().muted === true;
		}

		setVolume(volume) {
			if (volume === 0) {
				this.mute();
				return;
			}

			this.unmute();
			this.getAudioElement().volume = volume;
		}
	}

	window.analbum = {
		AudioSource,
		Lyrics,
		Track,
		Album,
		DownloadLink,
		Contributor,
		UI,

		lyrics: (...args) => new Lyrics(...args),
		album: (...args) => new Album(...args),
		track: (...args) => new Track(...args),
		source: (...args) => new AudioSource(...args),
		score: (...args) => new Score(...args),
		downloadLink: (...args) => new DownloadLink(...args),
		contributor: (...args) => new Contributor(...args),
		marker: (time, label) => ({ time, label }),
	};
}(window, document));
