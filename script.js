$(document).ready(function () {
	var config = {
		uptimerobot: {
			api_keys: [
				"m780064142-0c40e8dfe56e316d773f691f",
				"m780064172-bb8740c2fa9b01e79ae1816f",
				"m780064176-d54a380f84fe0ee858812c12",
				"m780079004-b4695aa518d32df04ac5e17a",
				"m780079005-b9fe41107c917655d005a6e1",
				"m780079006-dd20ff99199c8f8eb850a77f",
			],
			logs: 1,
			response_times: 1,
			all_time_uptime_ratio: 1,
			custom_uptime_ratios: "1-7-14-30",
			response_times_average: 30,
			response_times_warning: 600,
		},
		github: {
			org: 'vertig0ne',
			repo: 'statuspage'
		}
	};

	const status_text = {
		'operational': 'operational',
		'investigating': 'investigating',
		'major outage': 'outage',
		'degraded performance': 'degraded',
	};

	const monitors = config.uptimerobot.api_keys;
	for (var i in monitors) {
		var api_key = monitors[i];
		$.post('https://api.uptimerobot.com/v2/getMonitors', {
			"api_key": api_key,
			"format": "json",
			"logs": config.uptimerobot.logs,
			"response_times": config.uptimerobot.response_times,
			"all_time_uptime_ratio": config.uptimerobot.all_time_uptime_ratio,
			"custom_uptime_ratios": config.uptimerobot.custom_uptime_ratios,
			"response_times_average": config.uptimerobot.response_times_average
		}, function (response) {
			status(response);
		}, 'json');
	}

	function status(data) {
		data.monitors = data.monitors.map(function (check) {
			check.class = check.status === 2 ? 'label-success' : 'label-danger';
			check.text = check.status === 2 ? 'operational' : 'major outage';
			if (check.status !== 2 && !check.lasterrortime) {
				check.lasterrortime = Date.now();
			}
			if (check.status === 2 && Date.now() - (check.lasterrortime * 1000) <= 86400000) {
				check.class = 'label-danger';
				check.text = 'major outage';
			}
			if (check.status === 2 && Math.round(check.average_response_time) >= config.uptimerobot.response_times_warning) {
				check.class = 'label-warning';
				check.text = 'degraded performance';
			}
			return check;
		});

		var status = data.monitors.reduce(function (status, check) {
			return check.status !== 2 ? 'danger' : 'operational';
		}, 'operational');

		if (!$('#panel').data('incident')) {
			$('#panel').attr('class', 'panel-success');
			$('#paneltitle').html('All systems are operational.');
		}
		data.monitors.forEach(function (item) {
			var name = item.friendly_name;
			var clas = item.class;
			var text = item.text;
			var cleanName = item.friendly_name.replace(/[^0-9a-zA-Z ]/g, '');
			cleanName = cleanName.replace(/ /g,'');

			$('#services').append('<div class="list-group-item">' +
				'<span class="badge ' + clas + '">' + text + '</span>' +
				'<a href="#" class="list-group-item-heading" onclick="\$\(\'\#' + cleanName + '\').toggleClass(\'collapse\');">' + name + '</a>' +
				'<div id="' + cleanName + '" class="graph collapse">' +
				'<canvas id="' + cleanName + '_cvs" width="400" height="150"></canvas>' +
				'</div>' +
				'</div>');
			
			var upt = item.custom_uptime_ratio.split('-');
			var uptimeForever = item.all_time_uptime_ratio;

			$('#statistics tbody').append('<tr>' +
			'<td>' + item.friendly_name + '</td>' +
			'<td>' + upt[0] + '%</td>' +
			'<td>' + upt[1] + '%</td>' +
			'<td>' + upt[2] + '%</td>' +
			'<td>' + upt[3] + '%</td>' +
			'<td>' + uptimeForever + '%</td>' +
			'<td>' + item.average_response_time + '</td>' +
			'</tr>');

			var gph_data = {
				type: 'line',
				data: {
					labels: [],
					datasets: [{
						label: 'Response Time (ms)',
						backgroundColor: "rgba(102,67,220,0.5)",
						data: [],
					}]
				},
				options: {
					scales: {
						xAxes: [
							{
								display: false,
								ticks: {
									display: false,
									scaleFontSize: 0
								}
							}
						]
					}
				}
			};

			item.response_times.forEach(function (datapoint) {
				gph_data.data.labels.push(formatDate(new Date(datapoint.datetime * 1000),'D d M Y H:i:s (T)'));
				gph_data.data.datasets[0].data.push(datapoint.value);
			});

			gph_data.data.labels = gph_data.data.labels.reverse();
			gph_data.data.datasets[0].data = gph_data.data.datasets[0].data.reverse();

			var gph_ctx = $('#' + cleanName + '_cvs');
			var gph = new Chart(gph_ctx, gph_data);
		});
	};

	$.getJSON('https://api.github.com/repos/' + config.github.org + '/' + config.github.repo + '/issues?state=all').done(determineIncidentOrMaintenance);

	var maintainIssues = [];
	var incidentIssues = [];

	function determineIncidentOrMaintenance(issues) {
		issues.forEach(function (issue) {
			if (issue.labels.length > 0) {
				issue.labels.forEach(function (label) {
					if (label.name == 'maintenance') maintainIssues.push(issue);
					else incidentIssues.push(issue);
				});
			}
		});
		message(incidentIssues);
	}

	function message(issues) {
		issues.forEach(function (issue) {
			var status = issue.labels.reduce(function (status, label) {
				if (/^status:/.test(label.name)) {
					return label.name.replace('status:', '');
				} else {
					return status;
				}
			}, 'operational');

			var systems = issue.labels.filter(function (label) {
				return /^system:/.test(label.name);
			}).map(function (label) {
				return label.name.replace('system:', '')
			});

			if (issue.state === 'open') {
				$('#panel').data('incident', 'true');
				$('#panel').attr('class', 'panel-warning');
				$('#paneltitle').html('One or more systems inoperative');
			}

			var html = '<article class="timeline-entry">\n';
			html += '<div class="timeline-entry-inner">\n';

			if (issue.state === 'closed') {
				html += '<div class="timeline-icon bg-success"><i class="entypo-feather"></i></div>';
			} else {
				html += '<div class="timeline-icon bg-secondary"><i class="entypo-feather"></i></div>';
			}

			html += '<div class="timeline-label">\n';
			html += '<span class="date">' + formatDate(new Date(issue.created_at),'D d M Y H:i:s (T)') + '</span>\n';

			if (issue.state === 'closed') {
				html += '<span class="badge label-success pull-right">closed</span>';
			} else {
				html += '<span class="badge ' + (status === 'operational' ? 'label-success' : 'label-warn') + ' pull-right">open</span>\n';
			}

			for (var i = 0; i < systems.length; i++) {
				html += '<span class="badge system pull-right">' + systems[i] + '</span>';
			}

			html += '<h2>' + issue.title + '</h2>\n';
			html += '<hr>\n';
			html += '<p>' + issue.body + '</p>\n';

			if (issue.state === 'closed') {
				html += '<p><em>Updated ' + formatDate(new Date(issue.closed_at),'D d M Y H:i:s (T)') + '<br/>';
				html += 'The system is back in normal operation.</p>';
			}
			html += '</div>';
			html += '</div>';
			html += '</article>';
			$('#incidents').append(html);
		});

		if (maintainIssues.length > 0) {
			maintainIssues.forEach(function (issue) {
				$('#maintenance').append('<div class="list-group-item">' +
					'<h2 class="list-group-item-heading">' + issue.title + '</h2>' +
					'<p class="list-group-item-text">' + issue.body + '</p>' +
					'</div>');
			});
		}
		else {
			$('#maintenance').append('<div class="list-group-item">' +
				'<h4 class="list-group-item-heading"></h4>' +
				'<p class="list-group-item-text">There is currently no planned maintenance</p>' +
				'</div>');
		}
	};

	function formatDate(x, y) {
		var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		var fullMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
		var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
		var fullDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
		var suffix = ['st', 'nd', 'rd', 'th'];
		var z = {
			a: (x.getHours() >= 12)? 'pm' : 'am',
			A: (x.getHours() >= 12)? 'PM' : 'AM',
			B: Math.floor((((x.getUTCHours() + 1) % 24) + x.getUTCMinutes() / 60 + x.getUTCSeconds() / 3600) * 1000 / 24),
			c: x.toISOString(),
			m: (x.getHours().toString().length == 2)? x.getMonth() + 1 : '0' +  x.getMonth() + 1,
			M: months[x.getMonth()],
			n:  x.getMonth() + 1,
			L: parseInt(((x.getFullYear() % 4 == 0) && (x.getFullYear() % 100 != 0)) || (x.getFullYear() % 400 == 0)),
			F: fullMonths[x.getMonth()],
			d: (x.getDate().toString().length == 2)? x.getDate() : '0' + x.getDate(),
			j: x.getDate(),
			D: days[x.getDay()],
			l: fullDays[x.getDay()],
			N: x.getDay() + 1,
			w: x.getDay(),
			h: (x.getHours().toString().length == 2)? ((x.getHours() + 11) % 12 + 1) : '0' + ((x.getHours() + 11) % 12 + 1),
			H: (x.getHours().toString().length == 2)? x.getHours() : '0' + x.getHours(),
			G: x.getHours(),
			g: ((x.getHours() + 11) % 12 + 1),
			O: x.toString().match(/([-\+][0-9]+)\s/)[1],
			i: (x.getMinutes().toString().length == 2)? x.getMinutes() : '0' + x.getMinutes(),
			s: (x.getSeconds().toString().length == 2)? x.getSeconds() : '0' + x.getSeconds(), 
			T: x.toString().replace(/.*[(](.*)[)].*/,'$1'),
			e: x.toString().replace(/.*[(](.*)[)].*/,'$1'),
			Y: x.getFullYear(),
			y: x.getYear(),
			u: 000000,
			v: 000000,
			z: Math.round((new Date().setHours(23) - new Date(x.getYear()+1900, 0, 1, 0, 0, 0))/1000/60/60/24) - 1,
			U: Math.round(x.getTime() / 1000),
		};
		y = y.replace(/(a+|A+|B+|c+|m+|M+|n+|L+|F+|d+|D+|j+|l+|n+|N+|w+|g+|G+|O+|e+|u+|v+|z+|U+|h+|H+|i+|s+|T+|Y+|y+)/g, function(v) {
			var t = eval('z.' + v.slice(-1));
			return t;
		});
	
		return y.replace(/(y+)/g, function(v) {
			return x.getFullYear().toString().slice(-v.length)
		});
	};
});
