$(document).ready(function () {
	var uptimeConfig = {
		uptimerobot: {
			api_keys: [
				"m780064142-0c40e8dfe56e316d773f691f",
				"m780064172-bb8740c2fa9b01e79ae1816f"
			],
			logs: 1,
			response_times: 1
		},
		github: {
			org: 'vertig0ne',
			repo: 'statuspage'
		}
	};

	var status_text = {
		'operational': 'operational',
		'investigating': 'investigating',
		'major outage': 'outage',
		'degraded performance': 'degraded',
	};

	var monitors = uptimeConfig.uptimerobot.api_keys;
	for (var i in monitors) {
		var api_key = monitors[i];
		$.post('https://api.uptimerobot.com/v2/getMonitors', {
			"api_key": api_key,
			"format": "json",
			"logs": uptimeConfig.uptimerobot.logs,
			"response_times": uptimeConfig.uptimerobot.response_times,
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
				check.class = 'label-warning';
				check.text = 'degraded performance';
			}
			return check;
		});

		var status = data.monitors.reduce(function (status, check) {
			return check.status !== 2 ? 'danger' : 'operational';
		}, 'operational');

		if (!$('#panel').data('incident')) {
			$('#panel').attr('class', (status === 'operational' ? 'panel-success' : 'panel-warning'));
			$('#paneltitle').html(status === 'operational' ? 'All systems are operational.' : 'One or more systems inoperative');
		}
		data.monitors.forEach(function (item) {
			var name = item.friendly_name;
			var clas = item.class;
			var text = item.text;
			var cleanName = item.friendly_name.toLowerCase();
			cleanName = cleanName.replace(' ', '');

			$('#services').append('<div class="list-group-item">' +
				'<span class="badge ' + clas + '">' + text + '</span>' +
				'<a href="#" class="list-group-item-heading" onclick="\$\(\'\#' + cleanName + '\').toggleClass(\'collapse\');">' + name + '</a>' +
				'<div id="' + cleanName + '" class="graph collapse">' +
				'<canvas id="' + cleanName + '_cvs" width="400" height="150"></canvas>' +
				'</div>' +
				'</div>');

			var gph_data = {
				type: 'bar',
				data: {
					labels: [],
					datasets: [{
						label: 'Response Time (ms)',
						data: [],
					}]
				}
			};

			var gph_opts = {
				scales: {
					yAxes: [{
						ticks: {
							beginAtZero: true
						}
					}]
				}
			};

			item.response_times.forEach(function (datapoint) {
				gph_data.data.labels.push(datapoint.datetime);
				gph_data.data.datasets[0].data.push(datapoint.value);
			});

			var gph_ctx = $('#' + cleanName + '_cvs');
			var gph = new Chart(gph_ctx, gph_data, gph_opts);
		});
	};

	$.getJSON('https://api.github.com/repos/' + uptimeConfig.github.org + '/' + uptimeConfig.github.repo + '/issues?state=all').done(determineIncidentOrMaintenance);

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
				$('#panel').attr('class', (status === 'operational' ? 'panel-success' : 'panel-warn'));
				$('#paneltitle').html('<a href="#incidents">' + issue.title + '</a>');
			}

			var html = '<article class="timeline-entry">\n';
			html += '<div class="timeline-entry-inner">\n';

			if (issue.state === 'closed') {
				html += '<div class="timeline-icon bg-success"><i class="entypo-feather"></i></div>';
			} else {
				html += '<div class="timeline-icon bg-secondary"><i class="entypo-feather"></i></div>';
			}

			html += '<div class="timeline-label">\n';
			html += '<span class="date">' + datetime(issue.created_at) + '</span>\n';

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
				html += '<p><em>Updated ' + datetime(issue.closed_at) + '<br/>';
				html += 'The system is back in normal operation.</p>';
			}
			html += '</div>';
			html += '</div>';
			html += '</article>';
			$('#incidents').append(html);
		});

		maintainIssues.forEach(function (issue) {
			$('#maintenance').append('<div class="list-group-item">' +
				'<h2 class="list-group-item-heading">' + issue.title + '</h2>' +
				'<p class="list-group-item-text">' + issue.body + '</p>');
		});

		function datetime(string) {
			var datetime = string.split('T');
			var date = datetime[0];
			var time = datetime[1].replace('Z', '');
			return date + ' ' + time;
		};
	};
});
