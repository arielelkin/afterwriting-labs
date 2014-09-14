/* global define */
define(function (require) {

	var h = require('utils/fountain/helpers');

	var module = {};

	var regex = {
		title_page: /(title|credit|author[s]?|source|notes|draft date|date|contact|copyright)\:.*/i,

		section: /^(#+)(?: *)(.*)/,
		synopsis: /^(?:\=(?!\=+) *)(.*)/,

		scene_heading: /^((?:\*{0,3}_?)?(?:(?:int|ext|est|i\/e)[. ]).+)|^(?:\.(?!\.+))(.+)/i,
		scene_number: /( *#(.+)# *)/,

		transition: /^((?:FADE (?:TO BLACK|OUT)|CUT TO BLACK)\.|.+ TO\:)|^(?:> *)(.+)/,

		dialogue: /^([A-Z*_]+[0-9A-Z (._\-')]*)(\^?)?(?:\n(?!\n+))([\s\S]+)/,
		character: /^([A-Z*_]+[0-9A-Z (._\-')]*)\^?$/,
		parenthetical: /^(\(.+\))$/,

		action: /^(.+)/g,
		centered: /^(?:> *)(.+)(?: *<)(\n.+)*/g,

		page_break: /^\={3,}$/,
		line_break: /^ {2}$/
	};

	module.parse = function (original_script, cfg) {

		var script = original_script,
			result = {
				title_page: [],
				tokens: []
			};

		if (!script) {
			return result;
		}

		var new_line_length = script.match(/\r\n/) ? 2 : 1;

		if (!cfg.print_notes) {
			script = script.replace(/ {0,1}\[\[/g, ' /*').replace(/\]\] {0,1}/g, '*/');
		}

		var lines = script.split(/\r\n|\r|\n/);

		var create_token = function (text, cursor, line) {
			return h.create_token({
				text: text.trim(),
				start: cursor,
				end: cursor + text.length - 1 + new_line_length,
				line: line
			});
		};

		var lines_length = lines.length,
			current = 0,
			match, text, last_title_page_token,
			token, last_was_separator = false,
			token_category = 'none',
			last_character_index,
			dual_right,
			state = 'title_page',
			cache_state_for_comment,
			nested_comments = 0,
			title_page_started = false;


		var reduce_comment = function (prev, current) {
			if (current == '/*') {
				nested_comments++;
			} else if (current == '*/') {
				nested_comments--;
			} else if (!nested_comments) {
				prev = prev + current;
			}
			return prev;
		};

		var if_not_empty = function (a) {
			return a;
		};

		for (var i = 0; i < lines_length; i++) {
			text = lines[i];

			// replace inline comments
			text = text.split(/(\/\*){1}|(\*\/){1}|([^\/\*]+)/g).filter(if_not_empty).reduce(reduce_comment, '');

			if (nested_comments && state != 'ignore') {
				cache_state_for_comment = state;
				state = 'ignore';
			} else if (state == 'ignore') {
				state = cache_state_for_comment;
			}

			if (nested_comments === 0 && state === 'ignore') {
				state = cache_state_for_comment;
			}


			token = create_token(text, current, i);
			current = token.end + 1;

			if (text.trim().length === 0) {
				if (!last_was_separator) {
					state = 'normal';
					dual_right = false;
					token.type = 'separator';
					last_was_separator = true;
					result.tokens.push(token);
					continue;
				} else {
					// ignore blank separators
					continue;
				}
			}

			token_category = 'script';

			if (state === 'title_page') {
				if (regex.title_page.test(token.text)) {
					var split = token.text.split(":");
					token.type = split[0].toLowerCase();
					token.text = split[1] || '';
					last_title_page_token = token;
					result.title_page.push(token);
					title_page_started = true;
					continue;
				} else if (title_page_started) {
					last_title_page_token.text += (last_title_page_token.text ? "\n" : "") + token.text;
					continue;
				} else {
					state = 'normal';
				}
			}

			if (state === 'normal') {
				if (token.text.match(regex.line_break)) {
					token_category = 'none';
				} else if (token.text.match(regex.centered)) {
					token.type = 'centered';
					token.text = token.text.replace(/>|</g, '').trim();
				} else if (token.text.match(regex.transition)) {
					token.text = token.text.replace(/> ?/, '');
					token.type = 'transition';
				} else if (match = token.text.match(regex.synopsis)) {
					if (!cfg.print_synopsis) {
						continue;
					}
					token.text = match[1];
					token.type = 'synopsis';
				} else if (match = token.text.match(regex.section)) {
					if (!cfg.print_sections) {
						continue;
					}
					token.level = match[1].length;
					token.text = match[2];
					token.type = 'section';
				} else if (token.text.match(regex.scene_heading)) {
					token.text = token.text.replace(/^\./, '');
					if (cfg.double_space_between_scenes) {
						var additional_separator = h.create_token({
							text: '',
							start: token.start,
							end: token.end,
							lines: [''],
							type: 'separator'
						});
						result.tokens.push(additional_separator);
					}
					token.type = 'scene_heading';
				} else if (token.text.match(regex.character)) {
					if (i === lines_length || i === lines_length - 1 || lines[i + 1].length === 0) {
						token.type = 'shot';
					} else {
						state = 'dialogue';
						token.type = 'character';
						if (token.text[token.text.length - 1] === '^') {
							if (cfg.use_dual_dialogue) {
								// update last dialogue to be dual:left
								var dialogue_tokens = ['dialogue', 'character', 'parenthetical'];
								while (dialogue_tokens.indexOf(result.tokens[last_character_index].type) != -1) {
									result.tokens[last_character_index].dual = 'left';
									last_character_index++;
								}
								token.dual = 'right';
								dual_right = true;
							}
							token.text = token.text.replace('^', '');
						}
						last_character_index = result.tokens.length;
					}
				} else if (token.text.match(regex.page_break)) {
					token.text = '';
					token.type = 'page_break';
				} else {
					token.type = 'action';
				}
			} else {
				if (token.text.match(regex.parenthetical)) {
					token.type = 'parenthetical';
				} else {
					token.type = 'dialogue';
				}
				if (dual_right) {
					token.dual = 'right';
				}
			}

			last_was_separator = false;

			if (token_category === 'script' && state !== 'ignore') {
				result.tokens.push(token);
			}


		}

		return result;
	};

	return module;
});