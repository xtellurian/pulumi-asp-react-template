using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Azure.KeyVault;
using Microsoft.Azure.Services.AppAuthentication;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Configuration.AzureKeyVault;
using Microsoft.Extensions.Hosting;

namespace app
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            await CreateHostBuilder(args).Build().RunAsync();
        }

        public static IHostBuilder CreateHostBuilder(string[] args) =>
            Host.CreateDefaultBuilder(args)
                .ConfigureAppConfiguration((context, config) =>
                {
                    config.AddEnvironmentVariables();
                    var settings = config.Build();
                    UseKeyVault(config, settings);
                })
                .ConfigureWebHostDefaults(webBuilder =>
                {
                    webBuilder.UseStartup<Startup>();
                });

        private static void UseKeyVault(IConfigurationBuilder configurationBuilder, IConfigurationRoot settings)
        {
            var vaultUri = settings["KeyVaultUri"];
            if (vaultUri is null)
            {
                throw new NullReferenceException("kvUri was null");
            }
            System.Console.WriteLine($"Using KeyVault {vaultUri} as Config Provider");
            var azureServiceTokenProvider = new AzureServiceTokenProvider();
            var keyVaultClient = new KeyVaultClient(
                new KeyVaultClient.AuthenticationCallback(azureServiceTokenProvider.KeyVaultTokenCallback));
            var manager = new DefaultKeyVaultSecretManager();
            configurationBuilder.AddAzureKeyVault(vaultUri, keyVaultClient, manager);
            try
            {
                var httpsPrefix = "https://";
                if (vaultUri.StartsWith(httpsPrefix))
                {
                    var kvHost = vaultUri.Substring(httpsPrefix.Length).Trim('/');
                    var entry = System.Net.Dns.GetHostEntry(kvHost);
                }
                else
                {
                    throw new ArgumentException("Vault URI mist begin with https://");
                }
            }
            catch (System.Exception ex)
            {
                System.Console.WriteLine($"KeyVault DNS Lookup Failed!");
                throw ex;
            }
        }

    }
}
