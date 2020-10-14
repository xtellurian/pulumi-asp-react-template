using System;
using System.Collections.Generic;
using System.Linq;
using app.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace app.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class WeatherForecastController : ControllerBase
    {
        private static readonly string[] Summaries = new[]
        {
            "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
        };

        private readonly ILogger<WeatherForecastController> _logger;
        private readonly IOptionsMonitor<SecretForecast> secretOptions;

        public WeatherForecastController(ILogger<WeatherForecastController> logger, IOptionsMonitor<SecretForecast> secretOptions)
        {
            _logger = logger;
            this.secretOptions = secretOptions;
        }

        [HttpGet]
        public IEnumerable<WeatherForecast> Get()
        {
            var rng = new Random();
            var forecasts = Enumerable.Range(1, 5).Select(index => new WeatherForecast
            {
                Date = DateTime.Now.AddDays(index),
                TemperatureC = rng.Next(-20, 55),
                Summary = Summaries[rng.Next(Summaries.Length)]
            })
            .ToList();

            forecasts.Add(new WeatherForecast
            {
                Date = DateTime.MinValue,
                TemperatureC = -99,
                Summary = secretOptions.CurrentValue.Summary
            });
            return forecasts;
        }
    }
}
